from sqlalchemy import select
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import Admin, Pilot
from app.security import hash_password


def main() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        admin = db.scalar(select(Admin).where(Admin.username == settings.admin_username))
        if admin is None:
            db.add(Admin(username=settings.super_admin_username, password_hash=hash_password(settings.super_admin_password)))
            print(f"Encargado creado: {settings.super_admin_username}")
            db.add(Admin(username=settings.admin_username, password_hash=hash_password(settings.admin_password)))
            print(f"Encargado creado: {settings.admin_username}")
            db.add(Admin(username=settings.user_username, password_hash=hash_password(settings.user_password)))
            print(f"Encargado creado: {settings.user_username}")

        else:
            print(f"El encargado {settings.admin_username} ya existe; no se cambió la contraseña.")
        if db.scalar(select(Pilot.id).limit(1)) is None:
            db.add_all([Pilot(nombre=n) for n in ["Ernesto", "Julian"]])
            # db.add_all([Pilot(nombre=n) for n in ["C. Mora", "A. Ríos", "J. Peña", "L. Gómez"]])
            print("Se agregaron los pilotos de demostración. Puedes editarlos desde la API.")
        db.commit()
    print("Listo. Cambia la contraseña de demostración antes de desplegar.")


if __name__ == "__main__":
    main()
