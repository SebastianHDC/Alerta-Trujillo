import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DEMO = os.getenv("APP_MODE", "production") == "demo"
DATABASE_URL = os.getenv("DATABASE_URL")
if DEMO:
    DATABASE_URL = "sqlite:///" + str(ROOT / "demo.db")
elif not DATABASE_URL or not DATABASE_URL.startswith("postgresql+psycopg://"):
    raise RuntimeError("Configura DATABASE_URL con PostgreSQL o ejecuta APP_MODE=demo.")

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
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def new_id():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (CheckConstraint("role IN ('citizen', 'moderator')"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(12), default="citizen")


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'published', 'rejected')"),
        CheckConstraint("risk IN ('low', 'medium', 'high')"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    author_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    district: Mapped[str] = mapped_column(String(40))
    location: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(200))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    risk: Mapped[str | None] = mapped_column(String(8))
    public_summary: Mapped[str | None] = mapped_column(String(200))
    sample: Mapped[bool] = mapped_column(default=False)


class Review(Base):
    __tablename__ = "report_reviews"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    decision: Mapped[str] = mapped_column(String(12))
    note: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Vote(Base):
    __tablename__ = "report_votes"
    __table_args__ = (CheckConstraint("answer IN ('yes', 'no', 'unsure')"),)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), primary_key=True)
    answer: Mapped[str] = mapped_column(String(8))
