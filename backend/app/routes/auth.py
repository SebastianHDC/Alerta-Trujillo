from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import EmailStr, Field, StringConstraints, model_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from ..catalog import DISTRICTS
from ..database import Account, LoginSession
from ..security import (
    COOKIE_OPTIONS, DB, DUMMY_HASH, SESSION_COOKIE, CurrentAccount, SessionCookie,
    document_hash, password_hash, start_session, token_hash, verify_password,
)
from ..services import Input, account_view, notify

router = APIRouter(prefix="/auth")
Password = Annotated[str, StringConstraints(min_length=10, max_length=128, strip_whitespace=False)]


class Credentials(Input):
    email: EmailStr
    password: Password


class Registration(Credentials):
    nickname: str = Field(min_length=3, max_length=40)
    document_type: Literal["dni", "pasaporte", "ce"]
    document_number: str = Field(min_length=6, max_length=15)
    district: str | None = None
    accept_terms: Literal[True]

    @model_validator(mode="after")
    def validate_registration(self):
        number = self.document_number
        if self.document_type == "dni" and not (number.isdigit() and len(number) == 8):
            raise ValueError("El DNI debe tener 8 dígitos.")
        if not number.isalnum():
            raise ValueError("El número de documento solo admite letras y números.")
        if self.district and self.district not in DISTRICTS:
            raise ValueError("Selecciona un distrito del catálogo.")
        return self


@router.post("/register", status_code=201)
def register(payload: Registration, db: DB, response: Response):
    account = Account(
        name=payload.nickname, email=payload.email.lower(), password_hash=password_hash(payload.password),
        district=payload.district, document_type=payload.document_type,
        document_hash=document_hash(payload.document_type, payload.document_number),
    )
    db.add(account)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese correo o documento.")
    notify(db, account.id, "welcome", "¡Bienvenido a Alerta Trujillo! Tus reportes ayudan a mantener informada a la comunidad.")
    start_session(account, db, response)
    return account_view(account)


@router.post("/login")
def login(payload: Credentials, db: DB, response: Response):
    account = db.scalar(select(Account).where(Account.email == payload.email.lower()))
    valid = verify_password(payload.password, account.password_hash if account else DUMMY_HASH)
    if not account or not valid:
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    if not account.active:
        raise HTTPException(403, "Tu cuenta está desactivada. Comunícate con el equipo del proyecto.")
    start_session(account, db, response)
    return account_view(account)


@router.get("/me")
def me(account: CurrentAccount):
    return account_view(account)


@router.post("/logout", status_code=204)
def logout(db: DB, response: Response, token: SessionCookie = None):
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash(token)))
        db.commit()
    response.delete_cookie(SESSION_COOKIE, **COOKIE_OPTIONS)
