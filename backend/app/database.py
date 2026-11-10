import os
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import (
    JSON, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DEMO = os.getenv("APP_MODE", "production") == "demo"
DATABASE_URL = os.getenv("DATABASE_URL")
DEMO_DB = ROOT / "demo.db"
if DEMO:
    DATABASE_URL = "sqlite:///" + str(DEMO_DB)
elif not DATABASE_URL or not DATABASE_URL.startswith("postgresql+psycopg://"):
    raise RuntimeError("Configura DATABASE_URL con PostgreSQL o ejecuta APP_MODE=demo.")

UPLOADS = Path(os.getenv("UPLOADS_DIR") or ROOT / "uploads")
SCHEMA = "alerta_trujillo"
engine = create_engine(DATABASE_URL, pool_pre_ping=True, hide_parameters=True)
if not DEMO:
    engine = engine.execution_options(schema_translate_map={None: SCHEMA})
if DEMO:
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys = ON")


def db_session():
    with Session(engine) as session:
        yield session


def now():
    return datetime.now(timezone.utc)


def utc(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def new_id():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("role IN ('citizen', 'moderator', 'manager')"),
        CheckConstraint("document_type IS NULL OR document_type IN ('dni', 'pasaporte', 'ce')"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(40))  # Seudónimo visible; no se pide el nombre real.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(12), default="citizen")
    district: Mapped[str | None] = mapped_column(String(40))
    document_type: Mapped[str | None] = mapped_column(String(10))
    # Huella HMAC del documento: evita cuentas duplicadas sin guardar el número.
    document_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Report(Base):
    """Ciclo: pending → (rejected | community) → (verified | discarded)."""
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'rejected', 'community', 'verified', 'discarded')"),
        CheckConstraint("risk IN ('low', 'medium', 'high')"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    author_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    district: Mapped[str] = mapped_column(String(40))
    location: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(300))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    risk: Mapped[str | None] = mapped_column(String(8))
    public_summary: Mapped[str | None] = mapped_column(String(200))
    show_photo: Mapped[bool] = mapped_column(default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sample: Mapped[bool] = mapped_column(default=False)


class Evidence(Base):
    __tablename__ = "report_evidence"
    __table_args__ = (CheckConstraint("kind IN ('photo', 'video')"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))
    stored_name: Mapped[str] = mapped_column(String(80))
    content_type: Mapped[str] = mapped_column(String(40))
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Review(Base):
    __tablename__ = "report_reviews"
    __table_args__ = (CheckConstraint("stage IN ('screening', 'final')"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    stage: Mapped[str] = mapped_column(String(10))
    decision: Mapped[str] = mapped_column(String(12))
    note: Mapped[str] = mapped_column(String(300))
    checklist: Mapped[list] = mapped_column(JSON, default=list)
    knowledge_item_id: Mapped[str | None] = mapped_column(ForeignKey("knowledge_items.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Vote(Base):
    __tablename__ = "report_votes"
    __table_args__ = (CheckConstraint("answer IN ('yes', 'no', 'unsure')"),)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), primary_key=True)
    answer: Mapped[str] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(String(200))
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"))
    read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Contact(Base):
    """Directorio de derivación con responsable y fecha de vigencia (informe, tabla 6)."""
    __tablename__ = "contacts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(12))
    position: Mapped[int] = mapped_column(Integer, default=0)
    verified_at: Mapped[date | None] = mapped_column(Date)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))


class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'review', 'current', 'obsolete')"),
        CheckConstraint("audience IN ('public', 'internal')"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(10))
    audience: Mapped[str] = mapped_column(String(10), default="internal")
    body: Mapped[str] = mapped_column(Text, default="")
    problem: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    limits: Mapped[str | None] = mapped_column(Text)
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    backup_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))
    status: Mapped[str] = mapped_column(String(10), default="review")
    version: Mapped[int] = mapped_column(Integer, default=1)
    review_due: Mapped[date | None] = mapped_column(Date)
    last_editor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class KnowledgeVersion(Base):
    __tablename__ = "knowledge_versions"
    __table_args__ = (UniqueConstraint("item_id", "version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    item_id: Mapped[str] = mapped_column(ForeignKey("knowledge_items.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    change_note: Mapped[str] = mapped_column(String(200))
    editor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class KnowledgeUse(Base):
    """Evidencia de transferencia: quién aplicó qué guía, en qué caso y si le sirvió."""
    __tablename__ = "knowledge_uses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    item_id: Mapped[str] = mapped_column(ForeignKey("knowledge_items.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer)
    useful: Mapped[bool] = mapped_column(default=True)
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
