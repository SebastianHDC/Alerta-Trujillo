import argparse
from datetime import date, timedelta
from getpass import getpass

from email_validator import validate_email
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema

from .database import (
    DEMO, DEMO_DB, SCHEMA, Account, Base, Contact, KnowledgeItem, KnowledgeUse, KnowledgeVersion, Notification, Report, Review,
    UPLOADS, Vote, engine, new_id, now,
)
from .security import document_hash, password_hash

CONTACTS = [
    ("PNP – Central de emergencias", "Policía Nacional del Perú, atención las 24 horas.", "105", "police", True),
    ("Bomberos", "Cuerpo General de Bomberos Voluntarios del Perú.", "116", "fire", True),
    ("SAMU – Ambulancia", "Atención médica de urgencia del Ministerio de Salud.", "106", "health", True),
    ("Serenazgo de Trujillo", "Central de seguridad ciudadana municipal. Número pendiente de confirmar con la MPT.", "000000", "serenazgo", False),
]


def initialize():
    with engine.begin() as connection:
        if not DEMO:
            connection.execute(CreateSchema(SCHEMA, if_not_exists=True))
        Base.metadata.create_all(connection)


def seed_contacts(db: Session):
    if db.scalar(select(Contact.id).limit(1)):
        return
    for position, (name, description, phone, kind, verified) in enumerate(CONTACTS):
        db.add(Contact(name=name, description=description, phone=phone, kind=kind, position=position,
                       verified_at=date.today() if verified else None))


def attach_pdf(item: KnowledgeItem, title: str, lines: list[str]):
    """Genera un PDF de demostración con Pillow y lo adjunta al recurso."""
    from PIL import Image, ImageDraw, ImageFont

    page = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(page)
    font = ImageFont.load_default()
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            font = ImageFont.truetype(name, 30)
            break
        except OSError:
            continue
    draw.rectangle([0, 0, 1240, 140], fill=(13, 58, 107))
    draw.text((80, 50), title, fill="white", font=font)
    for index, line in enumerate(lines):
        draw.text((80, 220 + index * 56), line, fill=(19, 35, 58), font=font)
    UPLOADS.mkdir(parents=True, exist_ok=True)
    item.attachment = new_id() + ".pdf"
    page.save(UPLOADS / item.attachment, "PDF", resolution=150)
    item.attachment_type, item.attachment_name = "application/pdf", "manual-portal-equipo.pdf"


def demo_data():
    if not DEMO:
        raise SystemExit("Los datos ficticios requieren APP_MODE=demo.")
    engine.dispose()
    DEMO_DB.unlink(missing_ok=True)  # El modo demo se reconstruye desde cero en cada ejecución.
    initialize()
    with Session(engine) as db:
        def person(name, email, password, role="citizen", district=None, document=None, function=None):
            account = Account(name=name, email=email, password_hash=password_hash(password), role=role, district=district, function=function,
                              document_type="dni" if document else None, document_hash=document_hash("dni", document) if document else None)
            db.add(account)
            return account

        citizen = person("Vecino de prueba", "vecino@example.com", "VecinoDemo26!", district="La Esperanza", document="70000001")
        neighbor = person("Vecina Huanchaco", "vecina@example.com", "VecinaDemo26!", district="Huanchaco", document="70000002")
        moderator = person("Moderación de prueba", "moderador@example.com", "ModeradorDemo26!", "moderator", function="validacion")
        manager = person("Gestión del conocimiento", "gestor@example.com", "GestorDemo26!", "manager", function="conocimiento")
        coordinator = person("Coordinación del piloto", "coordinacion@example.com", "CoordinaDemo26!", "manager", function="coordinacion")
        analyst = person("Análisis de datos", "analista@example.com", "AnalistaDemo26!", "moderator", function="analisis")
        liaison = person("Enlace vecinal", "enlace@example.com", "EnlaceDemo26!", "moderator", function="participacion")
        person("Cuenta suspendida", "suspendida@example.com", "SuspendidaDemo26!", district="Moche", document="70000003").active = False
        db.flush()
        seed_contacts(db)

        def guide(title, category, kind, body, audience="internal", owner=manager, backup=moderator, **lesson):
            item = KnowledgeItem(title=title, category=category, kind=kind, audience=audience, body=body, owner_id=owner.id,
                                 backup_id=backup.id if backup else None, status="current", version=1, last_editor_id=owner.id,
                                 approved_by=(moderator if owner is manager else manager).id,
                                 review_due=date.today() + timedelta(days=90), **lesson)
            db.add(item)
            db.flush()
            db.add(KnowledgeVersion(item_id=item.id, version=1, snapshot={"title": title}, change_note="Versión inicial", editor_id=owner.id))
            return item

        guide("Cómo describir una incidencia", "incidencias", "guia", audience="public", body=(
            "Indica qué ocurrió, cuándo y una referencia que permita identificar el sector, como una intersección o un parque. "
            "Describe lo que observaste y evita nombres, apodos, placas o domicilios exactos de otras personas."))
        guide("Cómo se publica y valida un reporte", "incidencias", "guia", audience="public", body=(
            "1) El equipo revisa que el reporte no tenga datos sensibles. 2) La alerta aparece en el mapa como «Sin verificar» y los vecinos "
            "pueden indicar si es real o falsa. 3) El equipo de moderación decide si la marca como verificada o la descarta. "
            "El mapa muestra un punto aproximado y un resumen redactado por el equipo."))
        guide("Qué significa el nivel de riesgo", "analisis", "faq", audience="public", body=(
            "Alto: hechos contra las personas o que requieren atención prioritaria. Medio: situaciones que aumentan el riesgo, como "
            "zonas sin iluminación. Bajo: daños o molestias sin riesgo inmediato. El riesgo lo asigna el equipo, no el número de votos."))
        guide("Qué hacer en una emergencia", "incidencias", "guia", audience="public", body=(
            "Busca un lugar seguro y llama a la PNP (105), Bomberos (116) o SAMU (106). Alerta Trujillo no reemplaza los canales "
            "oficiales: los reportes se revisan después y no generan una atención inmediata."))
        criteria = guide("Criterios para redactar el resumen público", "incidencias", "guia", owner=moderator, backup=manager, body=(
            "Usa la fórmula «tipo de hecho + referencia general + franja horaria». Elimina nombres, rasgos físicos, placas y números de "
            "casa. Si el reporte acusa a una persona o negocio identificable, no lo publiques y explica el motivo en la nota interna."))
        lesson = guide("Referencias barriales ambiguas en reportes de iluminación", "aprendizaje", "leccion", body="",
                       problem="Varios reportes de luminarias apagadas usaban nombres locales de calles que el equipo no reconocía.",
                       action="Se pidió a los vecinos una intersección o un punto conocido y se añadió el ejemplo a la guía de descripción.",
                       result="Los reportes siguientes del mismo sector se ubicaron sin pedir aclaraciones.",
                       limits="Basado en casos de demostración; debe contrastarse con reportes reales del piloto.")
        guide("Reportes duplicados del mismo hecho", "aprendizaje", "leccion", body="", owner=moderator, backup=liaison,
              problem="Tres vecinos reportaron el mismo robo con horas distintas y el mapa mostraba tres alertas.",
              action="Se publicó una sola alerta y las otras se descartaron con la nota «duplicado»; los votos se concentraron en la publicada.",
              result="El mapa dejó de exagerar la incidencia en la zona y los autores recibieron la explicación por notificación.",
              limits="Requiere que quien modera compare la hora y la referencia; aún no hay detección automática.")
        guide("Procedimiento de revisión de un reporte", "incidencias", "procedimiento", owner=moderator, backup=coordinator, body="\n".join([
            "Abrir el reporte más antiguo o de mayor prioridad en la cola de revisión.",
            "Leer el texto original y revisar las evidencias adjuntas.",
            "Aplicar la lista de control de datos sensibles (nombres, domicilios, acusaciones, emergencias en curso).",
            "Redactar el resumen público con la fórmula «tipo de hecho + referencia general + franja horaria».",
            "Asignar el nivel de riesgo y publicar como «Sin verificar», o no publicar indicando el motivo interno.",
            "Con los votos vecinales y el contexto, verificar o descartar la alerta.",
            "Registrar la guía aplicada y, si el caso deja un aprendizaje, crear una lección aprendida.",
        ]))
        manual = guide("Manual del portal del equipo", "operacion", "manual", owner=coordinator, backup=manager, body=(
            "Describe los módulos del portal: inicio, usuarios y roles, revisión, base de conocimiento, lecciones aprendidas, mapa de "
            "conocimiento, indicadores y reportes. Incluye cómo crear cuentas del equipo, cómo aprobar una versión y cómo exportar reportes."))
        guide("Protocolo de privacidad y datos personales", "incidencias", "documento", owner=coordinator, backup=moderator,
              resource_url="https://www3.congreso.gob.pe/Docs/DGP/DIDP/files/ds_016-2024-jus.pdf", body=(
            "Resume cómo el proyecto aplica la minimización de datos del Reglamento de la Ley N.º 29733: seudónimos, huella del documento, "
            "ubicación redondeada, evidencias privadas y eliminación de metadatos GPS. Enlaza el texto oficial del reglamento."))
        guide("Diccionario de indicadores", "analisis", "documento", owner=analyst, backup=None, body=(
            "Define cada indicador del módulo de indicadores: fórmula, fuente de datos, meta propuesta y forma de interpretarlo. "
            "Las metas son propuestas del proyecto y deben contrastarse con la línea base del piloto."))
        guide("Referencias barriales de Trujillo", "contexto", "faq", owner=liaison, backup=moderator, body=(
            "¿Qué referencias usan los vecinos? Nombres de parques, mercados, paraderos y colegios. ¿Qué hacer si una calle tiene dos nombres? "
            "Registrar ambos en la referencia y usar el nombre oficial en el resumen público."))
        video = KnowledgeItem(title="Video: cómo validar una alerta desde la app", category="contexto", kind="video", audience="public",
                              body="Tutorial corto para vecinos: abrir una alerta cercana, revisar el resumen y responder «es real» o «es falso».",
                              owner_id=liaison.id, backup_id=manager.id, status="draft", version=1, last_editor_id=liaison.id)
        db.add(video)
        db.flush()
        db.add(KnowledgeVersion(item_id=video.id, version=1, snapshot={"title": video.title}, change_note="Borrador: falta grabar el video", editor_id=liaison.id))
        attach_pdf(manual, "Manual del portal del equipo", [
            "Alerta Trujillo - Manual del portal del equipo (demo)", "",
            "1. Inicio: resumen del estado de los reportes y accesos rápidos.",
            "2. Usuarios y roles: crear cuentas del equipo y asignar funciones.",
            "3. Revisión: lista de control, resumen público y decisión final.",
            "4. Base de conocimiento: guías, procedimientos, manuales y videos.",
            "5. Lecciones aprendidas: problema, solución, responsable y fecha.",
            "6. Mapa de conocimiento: quién sabe qué y dónde hay riesgo.",
            "7. Indicadores: fórmula, meta y semáforo.",
            "8. Reportes: filtros, impresión y exportación a CSV.",
        ])

        def report(author, category, district, lat, lon, description, hours, status, risk=None, summary=None):
            item = Report(author_id=author.id, category=category, district=district, latitude=lat, longitude=lon, location=district,
                          description=description, public_summary=summary, risk=risk, status=status, sample=True,
                          occurred_at=now() - timedelta(hours=hours), created_at=now() - timedelta(hours=hours - 0.5))
            if status != "pending":
                item.published_at = now() - timedelta(hours=max(hours - 2, 0.2))
            if status in {"verified", "discarded", "rejected"}:
                item.decided_at = now() - timedelta(hours=max(hours - 6, 0.1))
            db.add(item)
            db.flush()
            if status != "pending":
                db.add(Review(report_id=item.id, reviewer_id=moderator.id, stage="screening", decision="reject" if status == "rejected" else "publish",
                              note="Revisión de datos sensibles completada.", checklist=[], knowledge_item_id=criteria.id))
            if status in {"verified", "discarded"}:
                db.add(Review(report_id=item.id, reviewer_id=moderator.id, stage="final", decision=status, note="Decisión con base en votos y contexto."))
            return item

        examples = [
            (neighbor, "robo", "Trujillo", -8.1072, -79.0271, "high", "Intento de robo de celular en zona comercial, por la tarde.", 2, "verified"),
            (neighbor, "hurto", "Trujillo", -8.1150, -79.0330, "high", "Asalto a transeúnte cerca de un paradero, durante la noche.", 5, "community"),
            (neighbor, "iluminacion", "Trujillo", -8.1190, -79.0380, "medium", "Luminarias apagadas en una vía transitada.", 6, "verified"),
            (neighbor, "sospechoso", "La Esperanza", -8.0840, -79.0460, "medium", "Vehículo estacionado varias horas con personas observando viviendas.", 9, "community"),
            (neighbor, "vandalismo", "Víctor Larco Herrera", -8.1390, -79.0480, "low", "Daños en mobiliario de un parque.", 20, "verified"),
            (citizen, "via", "La Esperanza", -8.0800, -79.0500, "medium", "Desmonte que ocupa parte de una vereda.", 28, "verified"),
            (citizen, "iluminacion", "El Porvenir", -8.0870, -79.0040, "low", "Tramo con iluminación intermitente.", 50, "community"),
            (neighbor, "robo", "Huanchaco", -8.0790, -79.1200, "high", "Robo de pertenencias en la playa, al mediodía.", 70, "verified"),
            (citizen, "otro", "Moche", -8.1700, -79.0100, "low", "Ruidos fuertes reportados de madrugada.", 90, "discarded"),
        ]
        reports = [report(author, cat, district, lat, lon, summary, hours, status, risk, summary)
                   for author, cat, district, lat, lon, risk, summary, hours, status in examples]
        votes = {0: [(citizen, "yes")], 1: [(citizen, "yes")], 2: [(citizen, "yes")], 3: [(citizen, "unsure")], 6: [(neighbor, "yes")],
                 7: [(citizen, "yes")], 8: [(neighbor, "no")]}
        for index, voters in votes.items():
            for voter, answer in voters:
                db.add(Vote(report_id=reports[index].id, account_id=voter.id, answer=answer))
        report(citizen, "robo", "Trujillo", -8.1100, -79.0300,
               "Vi a dos personas arrebatar una cartera frente a la bodega de la esquina, una llevaba casaca roja.", 1, "pending")
        db.add(KnowledgeUse(item_id=criteria.id, account_id=moderator.id, report_id=reports[0].id, version=1, useful=True,
                            note="Sirvió para quitar la descripción física del resumen."))
        db.add(KnowledgeUse(item_id=lesson.id, account_id=manager.id, report_id=reports[6].id, version=1, useful=True,
                            note="Se aplicó para pedir una referencia más clara."))
        for text, kind in [("Tu alerta fue verificada. Ganaste 10 puntos.", "verified"),
                           ("Tu alerta ya es visible y está siendo validada por la comunidad.", "community"),
                           ("Ganaste 5 puntos: tu validación coincidió con la revisión.", "points")]:
            db.add(Notification(account_id=citizen.id, kind=kind, text=text))
        db.commit()


def create_staff(email: str, name: str, role: str):
    email = validate_email(email, check_deliverability=False).normalized.lower()
    password = getpass("Contraseña: ")
    if len(password) < 12 or len(password) > 128 or password != getpass("Repite la contraseña: "):
        raise SystemExit("Las contraseñas deben coincidir y tener entre 12 y 128 caracteres.")
    with Session(engine) as db:
        if db.scalar(select(Account).where(Account.email == email)):
            raise SystemExit("El correo ya está registrado.")
        db.add(Account(name=name, email=email, role=role, password_hash=password_hash(password)))
        db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-db")
    commands.add_parser("seed-demo")
    for command in ("create-moderator", "create-manager"):
        staff = commands.add_parser(command)
        staff.add_argument("email")
        staff.add_argument("name")
    args = parser.parse_args()
    if args.command == "init-db":
        initialize()
        with Session(engine) as session:
            seed_contacts(session)
            session.commit()
    elif args.command == "seed-demo":
        demo_data()
    else:
        create_staff(args.email, args.name, "moderator" if args.command == "create-moderator" else "manager")
