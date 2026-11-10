from collections import Counter
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator
from sqlalchemy import func, select, update

from ..catalog import CATEGORIES, KNOWLEDGE_CATEGORIES, KNOWLEDGE_KINDS, POINTS_VERIFIED_REPORT, POINTS_VOTE_MATCH, REVIEW_CHECKLIST
from ..database import Account, Contact, Evidence, KnowledgeItem, KnowledgeUse, KnowledgeVersion, Report, Review, Vote, now, utc
from ..security import DB, Manager, Staff
from ..services import Input, age_bucket, current_knowledge, notify, private_view, vote_counts

router = APIRouter(prefix="/staff")
Risk = Literal["low", "medium", "high"]


# ---------- Revisión de reportes ----------

class Screening(Input):
    decision: Literal["publish", "reject"]
    note: str = Field(min_length=5, max_length=300)
    risk: Risk | None = None
    public_summary: str | None = Field(default=None, min_length=10, max_length=200)
    show_photo: bool = False
    checklist: list[str] = []
    knowledge_item_id: str | None = None

    @model_validator(mode="after")
    def validate_screening(self):
        if self.decision == "publish":
            if not self.risk or not self.public_summary:
                raise ValueError("Indica el riesgo y redacta un resumen público sin datos personales.")
            if set(self.checklist) != set(REVIEW_CHECKLIST):
                raise ValueError("Completa la lista de control de datos sensibles antes de publicar.")
        return self


class FinalDecision(Input):
    decision: Literal["verified", "discarded"]
    note: str = Field(min_length=5, max_length=300)
    risk: Risk | None = None
    knowledge_item_id: str | None = None


def reviewable(db: DB, report_id: str, staff, status: str) -> Report:
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "No se encontró el reporte.")
    if report.author_id == staff.id:
        raise HTTPException(403, "Otra persona debe revisar este reporte.")
    if report.status != status:
        raise HTTPException(409, "El reporte cambió de estado. Actualiza la lista.")
    return report


def record_use(db: DB, staff, item: KnowledgeItem | None, report: Report, note: str):
    if item:
        db.add(KnowledgeUse(item_id=item.id, account_id=staff.id, report_id=report.id, version=item.version, useful=True, note=note[:300]))


@router.get("/queue")
def queue(staff: Staff, db: DB):
    reports = db.scalars(
        select(Report).where(Report.status.in_(["pending", "community"]), Report.author_id != staff.id).limit(200)
    ).all()
    counts = vote_counts(db, [report.id for report in reports])
    items = []
    for report in reports:
        votes = counts[report.id]
        item = private_view(db, report, votes)
        # Prioridad: riesgo asignado, actividad vecinal y antigüedad (informe, estrategia FA2).
        risk_weight = {"high": 30, "medium": 15, "low": 5}.get(report.risk or "", 10)
        hours = (now() - utc(report.created_at)).total_seconds() / 3600
        item["priority"] = round(risk_weight + 4 * (votes["yes"] + votes["no"]) + min(hours, 72) / 3)
        item["history"] = [
            dict(stage=review.stage, decision=review.decision, note=review.note, at=utc(review.created_at),
                 reviewer=db.get(Account, review.reviewer_id).name)
            for review in db.scalars(select(Review).where(Review.report_id == report.id).order_by(Review.created_at))
        ]
        items.append(item)
    items.sort(key=lambda item: (item["status"] != "pending", -item["priority"]))
    return items


@router.post("/reports/{report_id}/screening")
def screen_report(report_id: str, payload: Screening, staff: Staff, db: DB):
    report = reviewable(db, report_id, staff, "pending")
    item = current_knowledge(db, payload.knowledge_item_id)
    publish = payload.decision == "publish"
    has_photo = db.scalar(select(func.count()).select_from(Evidence).where(Evidence.report_id == report.id, Evidence.kind == "photo"))
    result = db.execute(update(Report).where(Report.id == report.id, Report.status == "pending").values(
        status="community" if publish else "rejected", risk=payload.risk if publish else None,
        public_summary=payload.public_summary if publish else None, show_photo=publish and payload.show_photo and bool(has_photo),
        published_at=now() if publish else None, decided_at=None if publish else now(),
    ))
    if result.rowcount != 1:
        raise HTTPException(409, "Este reporte ya tiene una decisión.")
    db.add(Review(report_id=report.id, reviewer_id=staff.id, stage="screening", decision=payload.decision,
                  note=payload.note, checklist=payload.checklist, knowledge_item_id=item.id if item else None))
    record_use(db, staff, item, report, "Aplicada en la revisión de datos sensibles.")
    notify(db, report.author_id, "community" if publish else "rejected",
           "Tu alerta ya es visible y está siendo validada por la comunidad." if publish
           else "Tu alerta no se publicó. Revisa las guías para describir incidencias sin datos sensibles.", report.id)
    db.commit()
    return private_view(db, report)


@router.post("/reports/{report_id}/decision")
def decide_report(report_id: str, payload: FinalDecision, staff: Staff, db: DB):
    report = reviewable(db, report_id, staff, "community")
    item = current_knowledge(db, payload.knowledge_item_id)
    verified = payload.decision == "verified"
    values = dict(status=payload.decision, decided_at=now())
    if payload.risk:
        values["risk"] = payload.risk
    result = db.execute(update(Report).where(Report.id == report.id, Report.status == "community").values(**values))
    if result.rowcount != 1:
        raise HTTPException(409, "Este reporte ya tiene una decisión.")
    db.add(Review(report_id=report.id, reviewer_id=staff.id, stage="final", decision=payload.decision,
                  note=payload.note, knowledge_item_id=item.id if item else None))
    record_use(db, staff, item, report, "Aplicada en la decisión final.")
    notify(db, report.author_id, payload.decision,
           f"Tu alerta fue verificada. Ganaste {POINTS_VERIFIED_REPORT} puntos." if verified
           else "Tu alerta fue descartada tras la revisión del equipo.", report.id)
    match = "yes" if verified else "no"
    for voter in db.scalars(select(Vote.account_id).where(Vote.report_id == report.id, Vote.answer == match)):
        notify(db, voter, "points", f"Ganaste {POINTS_VOTE_MATCH} puntos: tu validación coincidió con la revisión.", report.id)
    db.commit()
    return private_view(db, report)


# ---------- Dashboard gerencial ----------

@router.get("/dashboard")
def dashboard(staff: Staff, db: DB):
    reports = db.scalars(select(Report)).all()
    status = Counter(report.status for report in reports)
    reference = now()
    decided = [report for report in reports if report.decided_at]
    hours = [(utc(report.decided_at) - utc(report.created_at)).total_seconds() / 3600 for report in decided]
    voted = set(db.scalars(select(Vote.report_id).distinct()))
    visible = [report for report in reports if report.status in {"community", "verified", "discarded"}]
    uses = db.scalars(select(KnowledgeUse)).all()
    items = db.scalars(select(KnowledgeItem).where(KnowledgeItem.status != "obsolete")).all()
    last_30 = [report for report in reports if utc(report.created_at) >= reference - timedelta(days=30)]
    by_day = Counter(utc(report.created_at).date().isoformat() for report in last_30)
    return dict(
        generated_at=reference,
        totals=dict(reports=len(reports), **{key: status[key] for key in ("pending", "community", "verified", "discarded", "rejected")}),
        median_hours_to_decision=round(sorted(hours)[len(hours) // 2], 1) if hours else None,
        community_participation=round(100 * sum(1 for report in visible if report.id in voted) / len(visible)) if visible else None,
        by_category=Counter(CATEGORIES[report.category] for report in reports if report.category in CATEGORIES).most_common(),
        by_district=Counter(report.district for report in reports).most_common(8),
        pending_age=Counter(age_bucket(report.created_at, reference) for report in reports if report.status in {"pending", "community"}),
        last_30_days=[(day, by_day[day]) for day in sorted(by_day)],
        knowledge=dict(
            current=sum(1 for item in items if item.status == "current"),
            in_review=sum(1 for item in items if item.status in {"review", "draft"}),
            lessons=sum(1 for item in items if item.kind == "leccion"),
            overdue=sum(1 for item in items if item.review_due and item.review_due < date.today()),
            without_backup=sum(1 for item in items if not item.backup_id),
            uses=len(uses), useful_percent=round(100 * sum(use.useful for use in uses) / len(uses)) if uses else None,
            reused_items=len({use.item_id for use in uses}),
        ),
    )


@router.get("/members")
def members(staff: Staff, db: DB):
    query = select(Account).where(Account.role.in_(["moderator", "manager"])).order_by(Account.name)
    return [dict(id=account.id, name=account.name, role=account.role) for account in db.scalars(query)]


# ---------- Directorio de contactos ----------

class ContactInput(Input):
    phone: str = Field(min_length=3, max_length=20, pattern=r"^[0-9 +\-]+$")
    description: str = Field(min_length=3, max_length=160)
    verified: bool = False


@router.put("/contacts/{contact_id}")
def edit_contact(contact_id: str, payload: ContactInput, manager: Manager, db: DB):
    contact = db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(404, "No se encontró el contacto.")
    contact.phone, contact.description, contact.updated_by = payload.phone, payload.description, manager.id
    contact.verified_at = date.today() if payload.verified else None
    db.commit()
    return dict(id=contact.id, phone=contact.phone, description=contact.description, verified_at=contact.verified_at)


# ---------- Base de conocimiento y lecciones aprendidas ----------

Text = Field(default=None, max_length=4000)


class KnowledgeInput(Input):
    title: str = Field(min_length=5, max_length=120)
    category: Literal[tuple(KNOWLEDGE_CATEGORIES)]  # type: ignore[valid-type]
    kind: Literal[tuple(KNOWLEDGE_KINDS)]  # type: ignore[valid-type]
    audience: Literal["public", "internal"] = "internal"
    body: str = Field(default="", max_length=6000)
    problem: str | None = Text
    action: str | None = Text
    result: str | None = Text
    limits: str | None = Text
    report_id: str | None = None
    owner_id: str
    backup_id: str | None = None
    review_due: date | None = None
    change_note: str = Field(min_length=3, max_length=200)

    @model_validator(mode="after")
    def validate_item(self):
        if self.kind == "leccion":
            if not all([self.problem, self.action, self.result, self.limits]):
                raise ValueError("Una lección aprendida necesita problema, acción, resultado y límites.")
            if self.audience == "public":
                raise ValueError("Las lecciones aprendidas son de uso interno.")
        elif len(self.body) < 20:
            raise ValueError("Escribe el contenido de la guía (mínimo 20 caracteres).")
        if self.backup_id and self.backup_id == self.owner_id:
            raise ValueError("El suplente debe ser una persona distinta del responsable.")
        return self


class UseInput(Input):
    useful: bool
    note: str = Field(min_length=3, max_length=300)
    report_id: str | None = None


FIELDS = ("title", "category", "kind", "audience", "body", "problem", "action", "result", "limits", "report_id", "owner_id", "backup_id", "review_due")


def item_view(db: DB, item: KnowledgeItem, full: bool = False):
    names = lambda account_id: db.get(Account, account_id).name if account_id else None  # noqa: E731
    view = dict(
        id=item.id, title=item.title, category=item.category, kind=item.kind, audience=item.audience, status=item.status,
        version=item.version, owner=names(item.owner_id), owner_id=item.owner_id, backup=names(item.backup_id), backup_id=item.backup_id,
        review_due=item.review_due, updated_at=utc(item.updated_at), last_editor_id=item.last_editor_id,
        uses=db.scalar(select(func.count()).select_from(KnowledgeUse).where(KnowledgeUse.item_id == item.id)),
    )
    if full:
        view |= dict(
            body=item.body, problem=item.problem, action=item.action, result=item.result, limits=item.limits,
            report_id=item.report_id, approved_by=names(item.approved_by), last_editor=names(item.last_editor_id),
            versions=[dict(version=v.version, note=v.change_note, editor=names(v.editor_id), at=utc(v.created_at))
                      for v in db.scalars(select(KnowledgeVersion).where(KnowledgeVersion.item_id == item.id).order_by(KnowledgeVersion.version.desc()))],
            use_log=[dict(user=names(u.account_id), version=u.version, useful=u.useful, note=u.note, report_id=u.report_id, at=utc(u.created_at))
                     for u in db.scalars(select(KnowledgeUse).where(KnowledgeUse.item_id == item.id).order_by(KnowledgeUse.created_at.desc()).limit(30))],
        )
    return view


def check_people(db: DB, payload: KnowledgeInput):
    for account_id in filter(None, [payload.owner_id, payload.backup_id]):
        account = db.get(Account, account_id)
        if not account or account.role not in {"moderator", "manager"}:
            raise HTTPException(422, "Responsable y suplente deben pertenecer al equipo.")
    if payload.report_id and not db.get(Report, payload.report_id):
        raise HTTPException(422, "El reporte vinculado no existe.")


def snapshot(db: DB, item: KnowledgeItem, staff, note: str):
    data = {field: getattr(item, field) for field in FIELDS}
    data["review_due"] = item.review_due.isoformat() if item.review_due else None
    db.add(KnowledgeVersion(item_id=item.id, version=item.version, snapshot=data, change_note=note, editor_id=staff.id))


@router.get("/knowledge")
def knowledge(staff: Staff, db: DB):
    return [item_view(db, item) for item in db.scalars(select(KnowledgeItem).order_by(KnowledgeItem.updated_at.desc()))]


@router.get("/knowledge/{item_id}")
def knowledge_item(item_id: str, staff: Staff, db: DB):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "No se encontró el recurso.")
    return item_view(db, item, full=True)


@router.post("/knowledge", status_code=201)
def create_knowledge(payload: KnowledgeInput, staff: Staff, db: DB):
    check_people(db, payload)
    item = KnowledgeItem(**payload.model_dump(exclude={"change_note"}), status="review", version=1, last_editor_id=staff.id)
    db.add(item)
    db.flush()
    snapshot(db, item, staff, payload.change_note)
    db.commit()
    return item_view(db, item, full=True)


@router.put("/knowledge/{item_id}")
def edit_knowledge(item_id: str, payload: KnowledgeInput, staff: Staff, db: DB):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "No se encontró el recurso.")
    check_people(db, payload)
    for field, value in payload.model_dump(exclude={"change_note"}).items():
        setattr(item, field, value)
    # Toda edición crea una versión nueva que otra persona debe aprobar.
    item.version, item.status, item.approved_by, item.last_editor_id, item.updated_at = item.version + 1, "review", None, staff.id, now()
    snapshot(db, item, staff, payload.change_note)
    db.commit()
    return item_view(db, item, full=True)


@router.post("/knowledge/{item_id}/approve")
def approve_knowledge(item_id: str, staff: Staff, db: DB):
    item = db.get(KnowledgeItem, item_id)
    if not item or item.status != "review":
        raise HTTPException(409, "Solo se aprueban recursos en revisión.")
    if item.last_editor_id == staff.id:
        raise HTTPException(403, "La aprobación la hace una persona distinta de quien redactó la versión.")
    item.status, item.approved_by, item.updated_at = "current", staff.id, now()
    if not item.review_due:
        item.review_due = date.today() + timedelta(days=90)
    db.commit()
    return item_view(db, item, full=True)


@router.post("/knowledge/{item_id}/obsolete")
def retire_knowledge(item_id: str, staff: Staff, db: DB):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "No se encontró el recurso.")
    item.status, item.updated_at = "obsolete", now()
    db.commit()
    return item_view(db, item, full=True)


@router.post("/knowledge/{item_id}/uses", status_code=201)
def register_use(item_id: str, payload: UseInput, staff: Staff, db: DB):
    item = db.get(KnowledgeItem, item_id)
    if not item or item.status != "current":
        raise HTTPException(409, "Solo se registra el uso de recursos vigentes.")
    if payload.report_id and not db.get(Report, payload.report_id):
        raise HTTPException(422, "El reporte vinculado no existe.")
    db.add(KnowledgeUse(item_id=item.id, account_id=staff.id, report_id=payload.report_id, version=item.version, useful=payload.useful, note=payload.note))
    db.commit()
    return item_view(db, item, full=True)
