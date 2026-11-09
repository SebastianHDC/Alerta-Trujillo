from datetime import timedelta
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError

from .catalog import CATEGORIES, DISTRICTS
from .database import Account, DEMO, LoginSession, Report, Review, Vote, now, utc
from .security import (
    COOKIE_OPTIONS, DB, DUMMY_HASH, SESSION_COOKIE, CurrentAccount, Moderator, SessionCookie,
    password_hash, start_session, token_hash, verify_password,
)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Credentials(Input):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=10, max_length=128, strip_whitespace=False)]


class Registration(Credentials):
    name: str = Field(min_length=2, max_length=80)


Category = Literal["robo", "iluminacion", "vandalismo", "via", "otro"]
Risk = Literal["low", "medium", "high"]


class NewReport(Input):
    category: Category
    district: str
    location: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=200)
    latitude: float = Field(ge=-8.35, le=-7.8)
    longitude: float = Field(ge=-79.25, le=-78.55)
    occurred_at: AwareDatetime

    @model_validator(mode="after")
    def validate_incident(self):
        if self.district not in DISTRICTS:
            raise ValueError("Selecciona un distrito del catálogo.")
        if self.occurred_at > now() + timedelta(minutes=5):
            raise ValueError("La fecha del incidente debe estar en el pasado.")
        return self


class Decision(Input):
    status: Literal["published", "rejected"]
    note: str = Field(min_length=5, max_length=300)
    risk: Risk | None = None
    public_summary: str | None = Field(default=None, min_length=10, max_length=200)

    @model_validator(mode="after")
    def validate_decision(self):
        if self.status == "published" and (not self.risk or not self.public_summary):
            raise ValueError("Indica el riesgo y redacta un resumen público sin datos personales.")
        return self


class VoteInput(Input):
    answer: Literal["yes", "no", "unsure"]


def account_view(account: Account):
    return dict(id=account.id, name=account.name, email=account.email, role=account.role)


def public_view(report: Report):
    return dict(
        id=report.id, category=report.category, district=report.district,
        description=report.public_summary, latitude=round(report.latitude, 2),
        longitude=round(report.longitude, 2),
        occurred_at=utc(report.occurred_at).replace(minute=0, second=0, microsecond=0),
        risk=report.risk, sample=report.sample,
    )


def private_view(report: Report):
    return dict(
        id=report.id, category=report.category, district=report.district, location=report.location,
        description=report.description, latitude=report.latitude, longitude=report.longitude,
        occurred_at=utc(report.occurred_at), status=report.status,
    )


def check_api_request(request: Request):
    # A separate origin cannot set this header without a successful CORS preflight.
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("X-Alerta-Client") != "1":
        raise HTTPException(403, "Falta el encabezado X-Alerta-Client.")


app = FastAPI(title="Alerta Trujillo", version="0.1.0")
api = APIRouter(prefix="/api", dependencies=[Depends(check_api_request)])


@app.exception_handler(RequestValidationError)
def validation_error(_request: Request, error: RequestValidationError):
    # Never echo submitted values, especially credentials, in validation errors.
    errors = error.errors()
    first = errors[0] if errors else None
    detail = "Revisa los campos del formulario."
    if first and first["type"] == "value_error" and first["loc"] == ("body",):
        detail = str(first["ctx"]["error"])
    return JSONResponse({"detail": detail}, status_code=422)


@app.middleware("http")
async def prevent_api_caching(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@api.get("/health")
def health():
    return {"status": "ok", "mode": "demo" if DEMO else "production"}


@api.get("/catalog")
def catalog():
    return {"categories": CATEGORIES, "districts": DISTRICTS, "demo": DEMO}


@api.post("/auth/register", status_code=201)
def register(payload: Registration, db: DB, response: Response):
    account = Account(name=payload.name, email=payload.email.lower(), password_hash=password_hash(payload.password))
    db.add(account)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese correo.")
    start_session(account, db, response)
    return account_view(account)


@api.post("/auth/login")
def login(payload: Credentials, db: DB, response: Response):
    account = db.scalar(select(Account).where(Account.email == payload.email.lower()))
    valid = verify_password(payload.password, account.password_hash if account else DUMMY_HASH)
    if not account or not valid:
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    start_session(account, db, response)
    return account_view(account)


@api.get("/auth/me")
def me(account: CurrentAccount):
    return account_view(account)


@api.post("/auth/logout", status_code=204)
def logout(db: DB, response: Response, token: SessionCookie = None):
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash(token)))
        db.commit()
    response.delete_cookie(SESSION_COOKIE, **COOKIE_OPTIONS)


@api.get("/reports")
def reports(
    db: DB, category: Category | None = None, risk: Risk | None = None,
    days: Annotated[int, Query(ge=1, le=90)] = 30,
):
    query = select(Report).where(Report.status == "published", Report.occurred_at >= now() - timedelta(days=days))
    if category:
        query = query.where(Report.category == category)
    if risk:
        query = query.where(Report.risk == risk)
    return [public_view(report) for report in db.scalars(query.order_by(Report.occurred_at.desc(), Report.id).limit(200))]


@api.post("/reports", status_code=201)
def submit_report(payload: NewReport, account: CurrentAccount, db: DB):
    report = Report(author_id=account.id, sample=DEMO, **payload.model_dump())
    db.add(report)
    db.commit()
    return private_view(report)


@api.get("/reports/mine")
def own_reports(account: CurrentAccount, db: DB):
    query = select(Report).where(Report.author_id == account.id).order_by(Report.created_at.desc()).limit(200)
    return [private_view(report) for report in db.scalars(query)]


@api.get("/reports/{report_id}")
def report_details(report_id: str, db: DB):
    report = db.get(Report, report_id)
    if not report or report.status != "published":
        raise HTTPException(404, "No se encontró la alerta.")
    return public_view(report)


@api.put("/reports/{report_id}/vote", status_code=204)
def vote(report_id: str, payload: VoteInput, account: CurrentAccount, db: DB):
    report = db.get(Report, report_id)
    if not report or report.status != "published":
        raise HTTPException(404, "No se encontró la alerta.")
    if report.author_id == account.id:
        raise HTTPException(409, "Puedes responder a los reportes de otros vecinos.")
    insert = sqlite_insert if DEMO else postgres_insert
    statement = insert(Vote).values(report_id=report_id, account_id=account.id, answer=payload.answer)
    db.execute(statement.on_conflict_do_update(index_elements=["report_id", "account_id"], set_={"answer": payload.answer}))
    db.commit()


@api.get("/moderation/reports")
def pending_reports(moderator: Moderator, db: DB):
    query = select(Report).where(Report.status == "pending", Report.author_id != moderator.id)
    return [private_view(report) for report in db.scalars(query.order_by(Report.created_at.asc()).limit(100))]


@api.patch("/moderation/reports/{report_id}")
def decide_report(report_id: str, payload: Decision, moderator: Moderator, db: DB):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "No se encontró el reporte.")
    if report.author_id == moderator.id:
        raise HTTPException(403, "Otra persona debe revisar este reporte.")
    publish = payload.status == "published"
    result = db.execute(
        update(Report).where(Report.id == report_id, Report.status == "pending")
        .values(status=payload.status, risk=payload.risk if publish else None, public_summary=payload.public_summary if publish else None)
    )
    if result.rowcount != 1:
        raise HTTPException(409, "Este reporte ya tiene una decisión.")
    db.add(Review(report_id=report_id, reviewer_id=moderator.id, decision=payload.status, note=payload.note))
    db.commit()
    return private_view(report)


app.include_router(api)
dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
