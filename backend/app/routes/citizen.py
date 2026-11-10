from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import AwareDatetime, Field, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..catalog import CATEGORIES, DISTRICTS, POINTS_VERIFIED_REPORT
from ..database import DEMO, UPLOADS, Contact, Evidence, KnowledgeItem, Notification, Report, Vote, now, utc
from ..security import DB, CurrentAccount, OptionalAccount
from ..services import (
    MAX_EVIDENCE, VISIBLE, Input, notify, private_view, public_photo, public_view, ranking, store_evidence, vote_counts,
)

router = APIRouter()
Category = Literal[tuple(CATEGORIES)]  # type: ignore[valid-type]
Risk = Literal["low", "medium", "high"]


class NewReport(Input):
    category: Category
    district: str
    location: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=300)
    latitude: float = Field(ge=-8.35, le=-7.8)
    longitude: float = Field(ge=-79.25, le=-78.55)
    occurred_at: AwareDatetime

    @model_validator(mode="after")
    def validate_incident(self):
        if self.district not in DISTRICTS:
            raise ValueError("Selecciona un distrito del catálogo.")
        if self.occurred_at > now() + timedelta(minutes=5):
            raise ValueError("La fecha del incidente debe estar en el pasado.")
        if self.occurred_at < now() - timedelta(days=30):
            raise ValueError("Reporta incidencias de los últimos 30 días.")
        return self


class VoteInput(Input):
    answer: Literal["yes", "no", "unsure"]


def visible_alert(db: DB, report_id: str) -> Report:
    report = db.get(Report, report_id)
    if not report or report.status not in VISIBLE:
        raise HTTPException(404, "No se encontró la alerta.")
    return report


@router.get("/alerts")
def alerts(
    db: DB, account: OptionalAccount, category: Category | None = None, risk: Risk | None = None,
    hours: Annotated[int, Query(ge=1, le=720)] = 720, status: Literal["community", "verified"] | None = None,
):
    query = select(Report).where(Report.status.in_([status] if status else VISIBLE), Report.occurred_at >= now() - timedelta(hours=hours))
    if category:
        query = query.where(Report.category == category)
    if risk:
        query = query.where(Report.risk == risk)
    reports = db.scalars(query.order_by(Report.occurred_at.desc(), Report.id).limit(300)).all()
    ids = [report.id for report in reports]
    counts = vote_counts(db, ids)
    mine = dict(db.execute(select(Vote.report_id, Vote.answer).where(Vote.account_id == account.id, Vote.report_id.in_(ids))).all()) if account else {}
    photos = set(db.scalars(select(Evidence.report_id).where(Evidence.report_id.in_(ids), Evidence.kind == "photo")))
    return [
        public_view(report, counts[report.id], report.show_photo and report.id in photos, mine.get(report.id))
        | dict(own=bool(account and report.author_id == account.id))
        for report in reports
    ]


@router.get("/alerts/{report_id}")
def alert_detail(report_id: str, db: DB, account: OptionalAccount):
    report = visible_alert(db, report_id)
    my_vote = db.scalar(select(Vote.answer).where(Vote.report_id == report_id, Vote.account_id == account.id)) if account else None
    view = public_view(report, vote_counts(db, [report.id])[report.id], public_photo(db, report), my_vote)
    return view | dict(own=bool(account and report.author_id == account.id))


@router.get("/alerts/{report_id}/photo")
def alert_photo(report_id: str, db: DB):
    evidence_id = public_photo(db, visible_alert(db, report_id))
    if not evidence_id:
        raise HTTPException(404, "La alerta no tiene una foto pública.")
    evidence = db.get(Evidence, evidence_id)
    return FileResponse(UPLOADS / evidence.stored_name, media_type=evidence.content_type)


@router.put("/alerts/{report_id}/vote", status_code=204)
def vote(report_id: str, payload: VoteInput, account: CurrentAccount, db: DB):
    report = visible_alert(db, report_id)
    if report.status != "community":
        raise HTTPException(409, "Esta alerta ya fue revisada por el equipo de moderación.")
    if report.author_id == account.id:
        raise HTTPException(409, "Puedes validar los reportes de otros vecinos.")
    if account.role != "citizen":
        raise HTTPException(403, "El equipo no vota: la decisión se registra en el portal interno.")
    insert = sqlite_insert if DEMO else postgres_insert
    statement = insert(Vote).values(report_id=report_id, account_id=account.id, answer=payload.answer, created_at=now())
    db.execute(statement.on_conflict_do_update(index_elements=["report_id", "account_id"], set_={"answer": payload.answer}))
    db.commit()


@router.post("/reports", status_code=201)
def submit_report(payload: NewReport, account: CurrentAccount, db: DB):
    report = Report(author_id=account.id, sample=DEMO, **payload.model_dump())
    db.add(report)
    db.flush()
    notify(db, account.id, "sent", "Tu alerta fue enviada correctamente. El equipo revisará que no tenga datos sensibles.", report.id)
    db.commit()
    return private_view(db, report)


@router.post("/reports/{report_id}/evidence", status_code=201)
async def add_evidence(report_id: str, file: UploadFile, account: CurrentAccount, db: DB):
    report = db.get(Report, report_id)
    if not report or report.author_id != account.id:
        raise HTTPException(404, "No se encontró el reporte.")
    if report.status != "pending":
        raise HTTPException(409, "Solo puedes adjuntar evidencias antes de la revisión.")
    if db.scalar(select(func.count()).select_from(Evidence).where(Evidence.report_id == report_id)) >= MAX_EVIDENCE:
        raise HTTPException(409, f"Puedes adjuntar hasta {MAX_EVIDENCE} archivos.")
    evidence = await store_evidence(report, file)
    db.add(evidence)
    db.commit()
    return dict(id=evidence.id, kind=evidence.kind)


@router.get("/evidence/{evidence_id}")
def evidence_file(evidence_id: str, account: CurrentAccount, db: DB):
    evidence = db.get(Evidence, evidence_id)
    report = db.get(Report, evidence.report_id) if evidence else None
    if not report or (report.author_id != account.id and account.role not in {"moderator", "manager"}):
        raise HTTPException(404, "No se encontró la evidencia.")
    return FileResponse(UPLOADS / evidence.stored_name, media_type=evidence.content_type)


@router.get("/reports/mine")
def own_reports(account: CurrentAccount, db: DB):
    query = select(Report).where(Report.author_id == account.id).order_by(Report.created_at.desc()).limit(200)
    return [private_view(db, report) for report in db.scalars(query)]


@router.get("/profile")
def profile(account: CurrentAccount, db: DB):
    def count(*conditions):
        return db.scalar(select(func.count()).select_from(Report).where(Report.author_id == account.id, *conditions))
    points, position, total = ranking(db, account)
    activity = []
    for report in db.scalars(select(Report).where(Report.author_id == account.id).order_by(Report.created_at.desc()).limit(5)):
        activity.append(dict(kind="report", status=report.status, category=report.category, district=report.district,
                             at=utc(report.decided_at or report.published_at or report.created_at),
                             points=POINTS_VERIFIED_REPORT if report.status == "verified" else 0))
    votes = db.execute(
        select(Vote.created_at, Report.category, Report.district).join(Report, Report.id == Vote.report_id)
        .where(Vote.account_id == account.id).order_by(Vote.created_at.desc()).limit(5)
    )
    activity += [dict(kind="vote", category=category, district=district, at=utc(created), points=2) for created, category, district in votes]
    activity.sort(key=lambda item: item["at"], reverse=True)
    return dict(
        sent=count(), verified=count(Report.status == "verified"), in_review=count(Report.status.in_(["pending", "community"])),
        votes=db.scalar(select(func.count()).select_from(Vote).where(Vote.account_id == account.id)),
        points=points, rank=position, ranked=total, top_percent=max(1, round(100 * position / total)), activity=activity[:6],
    )


@router.get("/notifications")
def notifications(account: CurrentAccount, db: DB):
    items = db.scalars(select(Notification).where(Notification.account_id == account.id).order_by(Notification.created_at.desc()).limit(50))
    return [dict(id=item.id, kind=item.kind, text=item.text, report_id=item.report_id, read=item.read, created_at=utc(item.created_at)) for item in items]


@router.post("/notifications/read", status_code=204)
def read_notifications(account: CurrentAccount, db: DB):
    db.execute(update(Notification).where(Notification.account_id == account.id, Notification.read.is_(False)).values(read=True))
    db.commit()


@router.get("/contacts")
def contacts(db: DB):
    items = db.scalars(select(Contact).order_by(Contact.position, Contact.name))
    return [dict(id=item.id, name=item.name, description=item.description, phone=item.phone, kind=item.kind, verified_at=item.verified_at) for item in items]


@router.get("/guides")
def guides(db: DB):
    query = select(KnowledgeItem).where(KnowledgeItem.audience == "public", KnowledgeItem.status == "current").order_by(KnowledgeItem.title)
    return [dict(id=item.id, title=item.title, kind=item.kind, body=item.body, version=item.version, updated_at=utc(item.updated_at),
                 resource_url=item.resource_url, attachment=f"/api/knowledge/{item.id}/attachment" if item.attachment else None,
                 attachment_name=item.attachment_name, attachment_type=item.attachment_type) for item in db.scalars(query)]
