import hashlib
import hmac
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


def current_account(db: DB, token: SessionCookie = None) -> Account:
    session = db.get(LoginSession, token_hash(token)) if token else None
    account = db.get(Account, session.account_id) if session and utc(session.expires_at) > now() else None
    if account is None:
        raise HTTPException(401, "Inicia sesión para continuar.")
    return account


CurrentAccount = Annotated[Account, Depends(current_account)]


def require_moderator(account: CurrentAccount) -> Account:
    if account.role != "moderator":
        raise HTTPException(403, "Esta acción requiere permisos de moderación.")
    return account


Moderator = Annotated[Account, Depends(require_moderator)]
