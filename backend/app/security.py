import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .database import Account, DEMO, LoginSession, db_session, now, utc

DB = Annotated[Session, Depends(db_session)]
SESSION_COOKIE = "alerta_session"
COOKIE_OPTIONS = dict(httponly=True, secure=not DEMO, samesite="strict", path="/api")
SESSION_AGE = timedelta(hours=12)
DOCUMENT_PEPPER = os.getenv("DOCUMENT_PEPPER") or ("demo-pepper" if DEMO else "")
if not DOCUMENT_PEPPER:
    raise RuntimeError("Configura DOCUMENT_PEPPER con un valor secreto largo.")


def document_hash(kind: str, number: str) -> str:
    normalized = kind + ":" + "".join(char for char in number.upper() if char.isalnum())
    return hmac.new(DOCUMENT_PEPPER.encode(), normalized.encode(), hashlib.sha256).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64 * 1024 * 1024)
    return f"{salt}:{digest.hex()}"


DUMMY_HASH = password_hash(secrets.token_urlsafe())


def verify_password(password: str, stored: str) -> bool:
    return hmac.compare_digest(stored, password_hash(password, stored.split(":", 1)[0]))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(account: Account, db: Session, response: Response):
    token = secrets.token_urlsafe(32)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now()))
    db.add(LoginSession(token_hash=token_hash(token), account_id=account.id, expires_at=now() + SESSION_AGE))
    db.commit()
    response.set_cookie(SESSION_COOKIE, token, max_age=int(SESSION_AGE.total_seconds()), **COOKIE_OPTIONS)


SessionCookie = Annotated[str | None, Cookie(alias=SESSION_COOKIE)]


def optional_account(db: DB, token: SessionCookie = None) -> Account | None:
    session = db.get(LoginSession, token_hash(token)) if token else None
    account = db.get(Account, session.account_id) if session and utc(session.expires_at) > now() else None
    return account if account and account.active else None


OptionalAccount = Annotated[Account | None, Depends(optional_account)]


def current_account(account: OptionalAccount) -> Account:
    if account is None:
        raise HTTPException(401, "Inicia sesión para continuar.")
    return account


CurrentAccount = Annotated[Account, Depends(current_account)]


def require_staff(account: CurrentAccount) -> Account:
    if account.role not in {"moderator", "manager"}:
        raise HTTPException(403, "Esta acción requiere permisos del equipo.")
    return account


def require_manager(account: CurrentAccount) -> Account:
    if account.role != "manager":
        raise HTTPException(403, "Esta acción requiere el rol de gestión.")
    return account


Staff = Annotated[Account, Depends(require_staff)]
Manager = Annotated[Account, Depends(require_manager)]
