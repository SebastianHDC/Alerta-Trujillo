"""Módulos del portal: usuarios y roles (M2), adjuntos de la base de conocimiento (M3),
mapa de conocimiento (M5), indicadores (M6) y reportes exportables (M7)."""
import csv
import io
import secrets
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..catalog import CATEGORIES, DISTRICTS, KNOWLEDGE_CATEGORIES, KNOWLEDGE_KINDS, STAFF_FUNCTIONS
from .. import storage
from ..database import Account, Evidence, KnowledgeItem, KnowledgeUse, Report, Review, Vote, new_id, now, utc
from ..security import DB, Manager, OptionalAccount, Staff, password_hash
from ..services import UPLOAD_LIMIT, Input, read_limited

router = APIRouter()
Role = Literal["citizen", "moderator", "manager"]
Function = Literal[tuple(STAFF_FUNCTIONS)]  # type: ignore[valid-type]
STAFF_ROLES = {"moderator", "manager"}


# =====================================================================
# M2 · Usuarios y roles
# =====================================================================

def user_view(db: DB, account: Account):
    reports = db.scalar(select(func.count()).select_from(Report).where(Report.author_id == account.id))
    reviews = db.scalar(select(func.count()).select_from(Review).where(Review.reviewer_id == account.id))
    owned = db.scalar(select(func.count()).select_from(KnowledgeItem).where(KnowledgeItem.owner_id == account.id, KnowledgeItem.status != "obsolete"))
    return dict(id=account.id, name=account.name, email=account.email, role=account.role, function=account.function,
                district=account.district, active=account.active, created_at=utc(account.created_at),
                reports=reports, reviews=reviews, owned=owned)


@router.get("/staff/users")
def users(staff: Staff, db: DB, role: Role | None = None, q: str = Query(default="", max_length=80)):
    query = select(Account).order_by(Account.role.desc(), Account.name)
    if role:
        query = query.where(Account.role == role)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.where(func.lower(Account.name).like(like) | func.lower(Account.email).like(like))
    accounts = db.scalars(query.limit(300)).all()
    totals = Counter(account.role for account in db.scalars(select(Account)))
    return dict(totals=totals, users=[user_view(db, account) for account in accounts])


class NewStaff(Input):
    name: str = Field(min_length=3, max_length=40)
    email: EmailStr
    role: Literal["moderator", "manager"]
    function: Function


@router.post("/staff/users", status_code=201)
def create_staff(payload: NewStaff, manager: Manager, db: DB):
    temporary = secrets.token_urlsafe(9)
    account = Account(name=payload.name, email=payload.email.lower(), role=payload.role, function=payload.function,
                      password_hash=password_hash(temporary))
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese correo.")
    # La contraseña temporal se muestra una sola vez; no se guarda en texto plano.
    return dict(user=user_view(db, account), temporary_password=temporary)


class UserUpdate(Input):
    role: Role
    function: Function | None = None
    active: bool


@router.patch("/staff/users/{account_id}")
def update_user(account_id: str, payload: UserUpdate, manager: Manager, db: DB):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(404, "No se encontró la cuenta.")
    if account.id == manager.id and (payload.role != "manager" or not payload.active):
        raise HTTPException(409, "No puedes quitarte el rol de gestión ni desactivar tu propia cuenta.")
    if account.role == "manager" and (payload.role != "manager" or not payload.active):
        others = db.scalar(select(func.count()).select_from(Account).where(Account.role == "manager", Account.active.is_(True), Account.id != account.id))
        if not others:
            raise HTTPException(409, "Debe quedar al menos una cuenta de gestión activa.")
    if payload.role in STAFF_ROLES and not payload.function:
        raise HTTPException(422, "Asigna una función del equipo a esta cuenta.")
    account.role, account.active = payload.role, payload.active
    account.function = payload.function if payload.role in STAFF_ROLES else None
    db.commit()
    return user_view(db, account)


# =====================================================================
# M3 · Adjuntos de la base de conocimiento (documentos, manuales, videos)
# =====================================================================

ATTACHMENTS = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}
SIGNATURES = {".pdf": [b"%PDF"], ".docx": [b"PK"], ".pptx": [b"PK"], ".xlsx": [b"PK"], ".png": [b"\x89PNG"], ".jpg": [b"\xff\xd8"], ".webm": [b"\x1aE\xdf\xa3"]}


@router.post("/staff/knowledge/{item_id}/attachment")
async def upload_attachment(item_id: str, file: UploadFile, staff: Staff, db: DB):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "No se encontró el recurso.")
    extension = ATTACHMENTS.get(file.content_type or "")
    if not extension:
        raise HTTPException(422, "Formatos permitidos: PDF, Word, PowerPoint, Excel, MP4, WebM, PNG o JPG.")
    data = await read_limited(file, min(40 * 1024 * 1024, UPLOAD_LIMIT))
    valid = data[4:8] == b"ftyp" if extension == ".mp4" else any(data.startswith(sign) for sign in SIGNATURES[extension])
    if not valid:
        raise HTTPException(422, "El contenido del archivo no coincide con su formato.")
    previous = item.attachment
    item.attachment = new_id() + extension
    storage.save(item.attachment, data, file.content_type or "application/octet-stream")
    if previous:
        storage.delete(previous)
    item.attachment_type = file.content_type
    item.attachment_name = (file.filename or "archivo" + extension)[-120:]
    item.updated_at = now()
    db.commit()
    return dict(attachment=f"/api/knowledge/{item.id}/attachment", attachment_name=item.attachment_name, attachment_type=item.attachment_type)


@router.get("/knowledge/{item_id}/attachment")
def download_attachment(item_id: str, db: DB, account: OptionalAccount):
    item = db.get(KnowledgeItem, item_id)
    public = item is not None and item.audience == "public" and item.status == "current"
    if not item or not item.attachment or (not public and (not account or account.role not in STAFF_ROLES)):
        raise HTTPException(404, "No se encontró el archivo.")
    return storage.response(item.attachment, item.attachment_type or "application/octet-stream", filename=item.attachment_name, private=not public)


# =====================================================================
# M5 · Mapa de conocimiento
# =====================================================================

@router.get("/staff/knowledge-map")
def knowledge_map(staff: Staff, db: DB):
    members = db.scalars(select(Account).where(Account.role.in_(STAFF_ROLES), Account.active.is_(True)).order_by(Account.name)).all()
    items = db.scalars(select(KnowledgeItem).where(KnowledgeItem.status != "obsolete")).all()
    uses = Counter(db.scalars(select(KnowledgeUse.item_id)))
    people = []
    for member in members:
        owned = [item for item in items if item.owner_id == member.id]
        backup = [item for item in items if item.backup_id == member.id]
        people.append(dict(id=member.id, name=member.name, role=member.role, function=member.function,
                           owned=[item.id for item in owned], backup=[item.id for item in backup],
                           categories=sorted({item.category for item in owned + backup})))
    areas = []
    for key, label in KNOWLEDGE_CATEGORIES.items():
        in_area = [item for item in items if item.category == key]
        owners = {item.owner_id for item in in_area}
        backups = {item.backup_id for item in in_area if item.backup_id}
        functions = [fn for fn, info in STAFF_FUNCTIONS.items() if info["category"] == key]
        risk = "sin_recursos" if not in_area else "sin_suplente" if not backups else "dependencia" if len(owners | backups) < 2 else "cubierta"
        areas.append(dict(id=key, label=label, items=len(in_area), current=sum(1 for item in in_area if item.status == "current"),
                          uses=sum(uses[item.id] for item in in_area), people=len(owners | backups), functions=functions, coverage=risk))
    functions = [dict(id=key, label=info["label"], process=info["process"], category=info["category"], knowledge=info["knowledge"],
                      people=[member.id for member in members if member.function == key]) for key, info in STAFF_FUNCTIONS.items()]
    resources = [dict(id=item.id, title=item.title, kind=item.kind, category=item.category, status=item.status,
                      owner_id=item.owner_id, backup_id=item.backup_id, uses=uses[item.id]) for item in items]
    external = [
        dict(id="vecinos", label="Ciudadanos y juntas vecinales", process="Reconocimiento del territorio",
             knowledge="Referencias de ubicación, condiciones del barrio y experiencias sobre incidencias.", category="contexto"),
    ]
    return dict(people=people, functions=functions, areas=areas, resources=resources, external=external)


# =====================================================================
# M6 · Indicadores
# =====================================================================

def pct(part: float, total: float):
    return round(100 * part / total, 1) if total else None


def status_for(value, target, higher_is_better=True):
    if value is None:
        return "sin_datos"
    if higher_is_better:
        return "ok" if value >= target else "alerta" if value >= target * 0.75 else "critico"
    return "ok" if value <= target else "alerta" if value <= target * 1.5 else "critico"


def weekly(points: list[datetime], weeks: int = 6):
    today = now()
    series = []
    for index in range(weeks - 1, -1, -1):
        end = today - timedelta(days=7 * index)
        start = end - timedelta(days=7)
        series.append(dict(week=start.date().isoformat(), value=sum(1 for point in points if start <= utc(point) < end)))
    return series


@router.get("/staff/indicators")
def indicators(staff: Staff, db: DB):
    reports = db.scalars(select(Report)).all()
    reviews = db.scalars(select(Review)).all()
    votes = db.execute(select(Vote.answer, Report.status).join(Report, Report.id == Vote.report_id)).all()
    items = db.scalars(select(KnowledgeItem).where(KnowledgeItem.status != "obsolete")).all()
    uses = db.scalars(select(KnowledgeUse)).all()
    final = [report for report in reports if report.status in {"verified", "discarded"}]
    screened = {review.report_id: review for review in reviews if review.stage == "screening"}
    reviewed_24h = [r for r in reports if r.id in screened and utc(screened[r.id].created_at) - utc(r.created_at) <= timedelta(hours=24)]
    hours = sorted((utc(r.decided_at) - utc(r.created_at)).total_seconds() / 3600 for r in final if r.decided_at)
    median = round(hours[len(hours) // 2], 1) if hours else None
    visible = [r for r in reports if r.status in {"community", "verified", "discarded"}]
    voted = set(db.scalars(select(Vote.report_id).distinct()))
    decided_votes = [(answer, status) for answer, status in votes if status in {"verified", "discarded"} and answer != "unsure"]
    matches = sum(1 for answer, status in decided_votes if (answer, status) in {("yes", "verified"), ("no", "discarded")})
    with_guide = [review for review in reviews if review.knowledge_item_id]
    current = [item for item in items if item.status == "current"]
    lessons = [item for item in items if item.kind == "leccion"]
    closed = len(final) + sum(1 for r in reports if r.status == "rejected")
    rejected = sum(1 for r in reports if r.status == "rejected")
    definitions = [
        ("tiempo_decision", "Tiempo mediano hasta la decisión final", "Gestión de incidencias", median, "h", 48, False,
         "Mediana de (fecha de decisión final − fecha de recepción) en reportes verificados o descartados."),
        ("revision_24h", "Reportes revisados en menos de 24 h", "Gestión de incidencias", pct(len(reviewed_24h), len(screened)), "%", 80, True,
         "Reportes con revisión de datos sensibles en ≤ 24 h ÷ reportes revisados × 100."),
        ("participacion", "Alertas con validación vecinal", "Participación", pct(sum(1 for r in visible if r.id in voted), len(visible)), "%", 60, True,
         "Alertas publicadas con al menos un voto ÷ alertas publicadas × 100."),
        ("precision_vecinal", "Coincidencia de votos con la decisión final", "Participación", pct(matches, len(decided_votes)), "%", 70, True,
         "Votos «es real» en alertas verificadas + votos «es falso» en descartadas ÷ votos en alertas decididas × 100."),
        ("rechazo", "Reportes no publicados por datos sensibles", "Calidad de la información", pct(rejected, closed), "%", 20, False,
         "Reportes no publicados ÷ reportes cerrados × 100. Un valor alto indica que las guías de descripción no se entienden."),
        ("reutilizacion", "Decisiones que aplican una guía vigente", "Transferencia del conocimiento", pct(len(with_guide), len(reviews)), "%", 50, True,
         "Revisiones con guía aplicada registrada ÷ revisiones totales × 100."),
        ("utilidad", "Usos calificados como útiles", "Transferencia del conocimiento", pct(sum(use.useful for use in uses), len(uses)), "%", 80, True,
         "Usos registrados marcados como útiles ÷ usos registrados × 100."),
        ("suplente", "Recursos vigentes con suplente", "Continuidad", pct(sum(1 for item in current if item.backup_id), len(current)), "%", 100, True,
         "Recursos vigentes con suplente asignado ÷ recursos vigentes × 100 (informe, cap. V)."),
        ("revision_al_dia", "Recursos con revisión al día", "Continuidad", pct(sum(1 for item in current if not item.review_due or item.review_due >= date.today()), len(current)), "%", 90, True,
         "Recursos vigentes cuya fecha de próxima revisión no venció ÷ recursos vigentes × 100."),
        ("lecciones", "Lecciones aprendidas por cada 10 casos cerrados", "Aprendizaje", round(10 * len(lessons) / closed, 1) if closed else None, "", 1, True,
         "Lecciones registradas ÷ casos cerrados × 10."),
    ]
    result = [dict(id=key, name=name, group=group, value=value, unit=unit, target=target, higher_is_better=higher,
                   status=status_for(value, target, higher), formula=formula)
              for key, name, group, value, unit, target, higher, formula in definitions]
    return dict(
        generated_at=now(), indicators=result,
        series=dict(received=weekly([r.created_at for r in reports]), decided=weekly([r.decided_at for r in reports if r.decided_at]),
                    uses=weekly([use.created_at for use in uses])),
    )


# =====================================================================
# M7 · Reportes
# =====================================================================

STATUS_LABELS = {"pending": "En revisión", "rejected": "No publicado", "community": "Sin verificar", "verified": "Verificado", "discarded": "Descartado"}
RISK_LABELS = {"high": "Alto", "medium": "Medio", "low": "Bajo", None: ""}


def filtered_reports(db: DB, start: date | None, end: date | None, district: str | None, category: str | None, status: str | None):
    query = select(Report)
    if start:
        query = query.where(Report.created_at >= datetime.combine(start, datetime.min.time(), timezone.utc))
    if end:
        query = query.where(Report.created_at < datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc))
    if district:
        query = query.where(Report.district == district)
    if category:
        query = query.where(Report.category == category)
    if status:
        query = query.where(Report.status == status)
    return db.scalars(query.order_by(Report.created_at.desc()).limit(2000)).all()


def report_rows(db: DB, reports: list[Report]):
    ids = [report.id for report in reports]
    votes: dict[str, Counter] = defaultdict(Counter)
    for report_id, answer, total in db.execute(select(Vote.report_id, Vote.answer, func.count()).where(Vote.report_id.in_(ids)).group_by(Vote.report_id, Vote.answer)):
        votes[report_id][answer] = total
    evidence = Counter(db.scalars(select(Evidence.report_id).where(Evidence.report_id.in_(ids))))
    guides = Counter(db.scalars(select(Review.report_id).where(Review.report_id.in_(ids), Review.knowledge_item_id.is_not(None))))
    rows = []
    for report in reports:
        hours = round((utc(report.decided_at) - utc(report.created_at)).total_seconds() / 3600, 1) if report.decided_at else None
        rows.append(dict(id=report.id, created_at=utc(report.created_at), occurred_at=utc(report.occurred_at), category=report.category,
                         district=report.district, status=report.status, risk=report.risk, confirmations=votes[report.id]["yes"],
                         denials=votes[report.id]["no"], evidence=evidence[report.id], hours_to_decision=hours,
                         guide_applied=guides[report.id] > 0, summary=report.public_summary or ""))
    return rows


@router.get("/staff/reports")
def reports_module(staff: Staff, db: DB, start: date | None = None, end: date | None = None, district: str | None = None,
                   category: str | None = None, status: str | None = None):
    rows = report_rows(db, filtered_reports(db, start, end, district, category, status))
    decided = [row["hours_to_decision"] for row in rows if row["hours_to_decision"] is not None]
    return dict(
        generated_at=now(), filters=dict(start=start, end=end, district=district, category=category, status=status),
        summary=dict(total=len(rows), by_status=Counter(row["status"] for row in rows), by_category=Counter(row["category"] for row in rows).most_common(),
                     by_district=Counter(row["district"] for row in rows).most_common(), by_risk=Counter(row["risk"] or "sin_riesgo" for row in rows),
                     with_evidence=sum(1 for row in rows if row["evidence"]), avg_hours=round(sum(decided) / len(decided), 1) if decided else None),
        rows=rows,
    )


@router.get("/staff/reports.csv")
def reports_csv(staff: Staff, db: DB, start: date | None = None, end: date | None = None, district: str | None = None,
                category: str | None = None, status: str | None = None):
    rows = report_rows(db, filtered_reports(db, start, end, district, category, status))
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM para que Excel abra bien las tildes.
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["ID", "Recibido", "Ocurrió", "Categoría", "Distrito", "Estado", "Riesgo", "Confirmaciones", "Reportes de falso",
                     "Evidencias", "Horas hasta decisión", "Guía aplicada", "Resumen público"])
    for row in rows:
        writer.writerow([row["id"], row["created_at"].strftime("%Y-%m-%d %H:%M"), row["occurred_at"].strftime("%Y-%m-%d %H:%M"),
                         CATEGORIES.get(row["category"], row["category"]), row["district"], STATUS_LABELS[row["status"]], RISK_LABELS[row["risk"]],
                         row["confirmations"], row["denials"], row["evidence"], row["hours_to_decision"] if row["hours_to_decision"] is not None else "",
                         "Sí" if row["guide_applied"] else "No", row["summary"]])
    name = f"reportes-alerta-trujillo-{date.today().isoformat()}.csv"
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# Referencias para validar filtros en el frontend.
@router.get("/staff/reports/options")
def report_options(staff: Staff):
    return dict(districts=list(DISTRICTS), categories=CATEGORIES, statuses=STATUS_LABELS, kinds=KNOWLEDGE_KINDS)
