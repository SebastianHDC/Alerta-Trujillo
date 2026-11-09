import argparse
from datetime import timedelta
from getpass import getpass

from email_validator import validate_email
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema

from .database import Account, Base, DEMO, Report, SCHEMA, engine, now
from .security import password_hash


def initialize():
    with engine.begin() as connection:
        if not DEMO:
            connection.execute(CreateSchema(SCHEMA, if_not_exists=True))
        Base.metadata.create_all(connection)


def demo_data():
    if not DEMO:
        raise SystemExit("Los datos ficticios requieren APP_MODE=demo.")
    initialize()
    with Session(engine) as db:
        if db.scalar(select(Account).where(Account.email == "vecino@example.com")):
            return
        citizen = Account(name="Vecino de prueba", email="vecino@example.com", password_hash=password_hash("VecinoDemo26!"))
        moderator = Account(
            name="Moderación de prueba", email="moderador@example.com",
            password_hash=password_hash("ModeradorDemo26!"), role="moderator",
        )
        db.add_all([citizen, moderator])
        db.flush()
        examples = [
            ("robo", "Trujillo", -8.107, -79.027, "high", "Ejemplo ficticio de un intento de robo comunicado en una zona comercial.", 2),
            ("iluminacion", "Trujillo", -8.119, -79.038, "medium", "Ejemplo ficticio de luminarias apagadas en una vía transitada.", 6),
            ("vandalismo", "Víctor Larco Herrera", -8.139, -79.048, "low", "Ejemplo ficticio de daños en mobiliario de un espacio público.", 20),
            ("via", "La Esperanza", -8.084, -79.046, "medium", "Ejemplo ficticio de material que ocupa parte de una vereda.", 28),
            ("iluminacion", "El Porvenir", -8.087, -79.004, "low", "Ejemplo ficticio de un tramo con iluminación intermitente.", 50),
        ]
        for category, district, lat, lon, risk, summary, hours in examples:
            db.add(Report(
                author_id=moderator.id, category=category, district=district, latitude=lat, longitude=lon,
                location=district, description=summary, public_summary=summary, risk=risk,
                status="published", sample=True, occurred_at=now() - timedelta(hours=hours),
            ))
        db.commit()


def create_moderator(email: str, name: str):
    email = validate_email(email, check_deliverability=False).normalized.lower()
    password = getpass("Contraseña de moderación: ")
    if len(password) < 12 or len(password) > 128 or password != getpass("Repite la contraseña: "):
        raise SystemExit("Las contraseñas deben coincidir y tener entre 12 y 128 caracteres.")
    with Session(engine) as db:
        if db.scalar(select(Account).where(Account.email == email)):
            raise SystemExit("El correo ya está registrado.")
        db.add(Account(name=name, email=email, role="moderator", password_hash=password_hash(password)))
        db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-db")
    commands.add_parser("seed-demo")
    moderator = commands.add_parser("create-moderator")
    moderator.add_argument("email")
    moderator.add_argument("name")
    args = parser.parse_args()
    if args.command == "init-db":
        initialize()
    elif args.command == "seed-demo":
        demo_data()
    else:
        create_moderator(args.email, args.name)
