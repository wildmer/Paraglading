from collections.abc import Generator
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.config import settings


def normalize_database_url(url: str) -> str:
    """
    Acepta URLs SQLite (sqlite:///ruta, sqlite:////abs/ruta, file:/ruta o file:///ruta)
    y, por compatibilidad con entornos previos, normaliza URLs PostgreSQL a psycopg.
    Para producción con PostgreSQL se recomienda usar la URL psycopg directamente.
    """
    if url.startswith("sqlite://"):
        return url
    if url.startswith("file:"):
        # Formato URI de SQLite (file:/abs/path o file:///abs/path).
        path = url[len("file:"):]
        if path.startswith("///"):
            path = path[2:]  # deja una sola barra inicial -> /abs/path
        elif path.startswith("/"):
            pass  # ya es /abs/path
        else:
            path = "/" + path
        return f"sqlite://{path}"
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def build_engine():
    url = normalize_database_url(settings.database_url)
    if url.startswith("sqlite://"):
        # SQLite en FastAPI: hay que permitir acceso desde varios hilos.
        # Usamos StaticPool para mantener una sola conexión compartida cuando
        # la URL sea :memory:; para archivos, el pool por defecto está bien.
        if ":memory:" in url:
            from sqlalchemy.pool import StaticPool
            return create_engine(
                url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
                future=True,
            )
        # Asegurar que el directorio padre del archivo exista.
        file_part = url.replace("sqlite:///", "", 1)
        if file_part:
            parent = Path(file_part).expanduser().parent
            parent.mkdir(parents=True, exist_ok=True)
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            future=True,
        )
    # PostgreSQL u otros motores.
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=300,
    )


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
