"""Vistas, puntos, notificaciones y almacenamiento de evidencias."""
import io
from collections import Counter
from datetime import datetime, timedelta

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .catalog import POINTS_VERIFIED_REPORT, POINTS_VOTE, POINTS_VOTE_MATCH
from .database import MAX_UPLOAD_MB, Account, Evidence, KnowledgeItem, Notification, Report, Vote, new_id, utc
from . import storage

VISIBLE = ("community", "verified")
UPLOAD_LIMIT = int(MAX_UPLOAD_MB * 1024 * 1024)
PHOTO_LIMIT = min(8 * 1024 * 1024, UPLOAD_LIMIT)
VIDEO_LIMIT = min(25 * 1024 * 1024, UPLOAD_LIMIT)
MAX_EVIDENCE = 3


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def account_view(account: Account):
    return dict(id=account.id, name=account.name, email=account.email, role=account.role, district=account.district, function=account.function)


def vote_counts(db: Session, report_ids: list[str]) -> dict[str, Counter]:
    counts: dict[str, Counter] = {report_id: Counter() for report_id in report_ids}
    if report_ids:
        rows = db.execute(
            select(Vote.report_id, Vote.answer, func.count()).where(Vote.report_id.in_(report_ids)).group_by(Vote.report_id, Vote.answer)
        )
        for report_id, answer, total in rows:
            counts[report_id][answer] = total
    return counts


def public_photo(db: Session, report: Report) -> str | None:
    if not report.show_photo:
        return None
    return db.scalar(select(Evidence.id).where(Evidence.report_id == report.id, Evidence.kind == "photo").order_by(Evidence.created_at))


def public_view(report: Report, votes: Counter, photo: str | None = None, my_vote: str | None = None):
    # Ubicación redondeada (~1 km), hora en punto y resumen del moderador: nunca el texto original.
    return dict(
        id=report.id, category=report.category, district=report.district, description=report.public_summary,
        latitude=round(report.latitude, 3), longitude=round(report.longitude, 3),
        occurred_at=utc(report.occurred_at).replace(minute=0, second=0, microsecond=0),
        risk=report.risk, status=report.status, sample=report.sample,
        confirmations=votes["yes"], denials=votes["no"], unsure=votes["unsure"],
        photo=f"/api/alerts/{report.id}/photo" if photo else None, my_vote=my_vote,
    )


def private_view(db: Session, report: Report, votes: Counter | None = None):
    evidence = db.scalars(select(Evidence).where(Evidence.report_id == report.id).order_by(Evidence.created_at)).all()
    votes = votes if votes is not None else vote_counts(db, [report.id])[report.id]
    return dict(
        id=report.id, category=report.category, district=report.district, location=report.location,
        description=report.description, latitude=report.latitude, longitude=report.longitude,
        occurred_at=utc(report.occurred_at), created_at=utc(report.created_at), status=report.status,
        risk=report.risk, public_summary=report.public_summary, show_photo=report.show_photo,
        confirmations=votes["yes"], denials=votes["no"], unsure=votes["unsure"],
        evidence=[dict(id=item.id, kind=item.kind, url=f"/api/evidence/{item.id}") for item in evidence],
    )


def notify(db: Session, account_id: str, kind: str, text: str, report_id: str | None = None):
    db.add(Notification(account_id=account_id, kind=kind, text=text[:200], report_id=report_id))


def points_by_account(db: Session) -> Counter:
    points: Counter = Counter()
    for author, total in db.execute(select(Report.author_id, func.count()).where(Report.status == "verified").group_by(Report.author_id)):
        points[author] += total * POINTS_VERIFIED_REPORT
    rows = db.execute(select(Vote.account_id, Vote.answer, Report.status).join(Report, Report.id == Vote.report_id))
    for account_id, answer, status in rows:
        points[account_id] += POINTS_VOTE
        if (answer, status) in {("yes", "verified"), ("no", "discarded")}:
            points[account_id] += POINTS_VOTE_MATCH
    return points


def ranking(db: Session, account: Account) -> tuple[int, int, int]:
    """Devuelve (puntos, puesto, total de vecinos) entre las cuentas ciudadanas."""
    points = points_by_account(db)
    citizens = db.scalars(select(Account.id).where(Account.role == "citizen")).all()
    mine = points[account.id]
    above = sum(1 for citizen in citizens if points[citizen] > mine)
    return mine, above + 1, max(len(citizens), 1)


def current_knowledge(db: Session, item_id: str | None) -> KnowledgeItem | None:
    if not item_id:
        return None
    item = db.get(KnowledgeItem, item_id)
    if not item or item.status != "current":
        raise HTTPException(422, "La guía aplicada debe estar vigente.")
    return item


async def read_limited(upload: UploadFile, limit: int) -> bytes:
    data = bytearray()
    while chunk := await upload.read(1024 * 1024):
        data += chunk
        if len(data) > limit:
            raise HTTPException(413, f"El archivo supera el límite de {limit / (1024 * 1024):g} MB.")
    return bytes(data)


async def store_evidence(report: Report, upload: UploadFile) -> Evidence:
    content_type = upload.content_type or ""
    if content_type.startswith("image/"):
        raw = await read_limited(upload, PHOTO_LIMIT)
        try:
            image = Image.open(io.BytesIO(raw))
            image = ImageOps.exif_transpose(image).convert("RGB")
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise HTTPException(422, "La imagen no es válida.")
        image.thumbnail((1600, 1600))
        output = io.BytesIO()
        # Volver a codificar descarta los metadatos EXIF, incluida la ubicación GPS de la cámara.
        image.save(output, "JPEG", quality=82)
        data, kind, stored_type, extension = output.getvalue(), "photo", "image/jpeg", ".jpg"
    elif content_type.startswith("video/"):
        data = await read_limited(upload, VIDEO_LIMIT)
        if data[4:8] == b"ftyp":
            stored_type, extension = "video/mp4", ".mp4"
        elif data[:4] == b"\x1aE\xdf\xa3":
            stored_type, extension = "video/webm", ".webm"
        else:
            raise HTTPException(422, "Usa un video MP4 o WebM.")
        kind = "video"
    else:
        raise HTTPException(422, "Solo se aceptan fotos o videos.")
    stored_name = new_id() + extension
    storage.save(stored_name, data, stored_type)
    return Evidence(report_id=report.id, kind=kind, stored_name=stored_name, content_type=stored_type, size=len(data))


def age_bucket(created: datetime, reference: datetime) -> str:
    age = reference - utc(created)
    if age < timedelta(hours=24):
        return "Menos de 24 h"
    if age < timedelta(days=3):
        return "1 a 3 días"
    return "Más de 3 días"
