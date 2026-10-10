from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import Base, engine, get_db
from app.models import Admin, Participant, PhotoVideo, Pilot
from app.schemas import (
    LoginInput,
    ParticipantCreate,
    ParticipantUpdate,
    PaymentUpdate,
    PhotoVideoInput,
    PilotCreate,
    PilotOutput,
    SummaryOutput,
    TokenOutput,
)
from app.security import create_access_token, get_current_admin, verify_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cómodo para el primer despliegue; usa Alembic para migraciones versionadas en producción.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": settings.app_name}

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "parapente.db"

@app.get("/api/descargar-db")
async def descargar_db():
    if not DB_PATH.is_file():
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")

    return FileResponse(
        path=DB_PATH,
        filename="parapente.db",
        media_type="application/octet-stream",
    )


@app.post("/api/auth/login", response_model=TokenOutput)
def login(data: LoginInput, db: Session = Depends(get_db)):
    admin = db.scalar(select(Admin).where(Admin.username == data.username))
    if not admin or not admin.active or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token, expires = create_access_token(admin)
    return TokenOutput(access_token=token, expires_in=expires)


def participant_to_dict(u: Participant) -> dict:
    fv = None
    if u.foto_video:
        fv = {
            "id": u.foto_video.id,
            "medio": u.foto_video.medio,
            "valor": float(u.foto_video.valor),
            "paid": u.foto_video.paid,
            "at": u.foto_video.created_at,
            "updatedAt": u.foto_video.updated_at,
        }
    return {
        "id": u.id,
        "nombre": u.nombre,
        "correo": u.correo,
        "tel": u.tel,
        "peso": float(u.peso),
        "createdAt": u.created_at,
        "volado": u.volado,
        "voladoAt": u.volado_at,
        "pilotoAsignado": u.piloto_asignado.nombre if u.piloto_asignado else None,
        "pilotoAsignadoId": u.piloto_asignado_id,
        "pilotoVuelo": u.piloto_vuelo.nombre if u.piloto_vuelo else None,
        "pilotoVueloId": u.piloto_vuelo_id,
        "fv": fv,
    }


def get_participant(db: Session, participant_id: int) -> Participant:
    u = db.scalar(
        select(Participant)
        .options(joinedload(Participant.piloto_asignado), joinedload(Participant.piloto_vuelo), joinedload(Participant.foto_video))
        .where(Participant.id == participant_id)
    )
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    return u


@app.post("/api/usuarios", status_code=status.HTTP_201_CREATED)
def create_participant(data: ParticipantCreate, db: Session = Depends(get_db)):
    correo = str(data.correo).lower()
    existing = db.scalar(select(Participant.id).where(func.lower(Participant.correo) == correo))
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe un participante con ese correo")
    u = Participant(nombre=data.nombre, correo=correo, tel=data.tel, peso=data.peso)
    db.add(u)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return participant_to_dict(get_participant(db, u.id))


@app.get("/api/usuarios")
def list_participants(
    orden: str = Query("asc", pattern="^(asc|desc)$"),
    estado: str = Query("todos", pattern="^(todos|tierra|volado)$"),
    q: str | None = Query(None, max_length=160),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    stmt = select(Participant).options(
        joinedload(Participant.piloto_asignado),
        joinedload(Participant.piloto_vuelo),
        joinedload(Participant.foto_video),
    )
    if estado == "tierra":
        stmt = stmt.where(Participant.volado.is_(False))
    elif estado == "volado":
        stmt = stmt.where(Participant.volado.is_(True))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Participant.nombre.ilike(pattern), Participant.correo.ilike(pattern), Participant.tel.ilike(pattern)))
    weight_order = Participant.peso.asc() if orden == "asc" else Participant.peso.desc()
    stmt = stmt.order_by(weight_order, Participant.id.asc()).offset(skip).limit(limit)
    users = db.scalars(stmt).unique().all()
    return [participant_to_dict(u) for u in users]


@app.get("/api/usuarios/{participant_id}")
def read_participant(
    participant_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    return participant_to_dict(get_participant(db, participant_id))


@app.patch("/api/usuarios/{participant_id}")
def update_participant(
    participant_id: int,
    data: ParticipantUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = get_participant(db, participant_id)
    values = data.model_dump(exclude_unset=True)
    if "correo" in values and values["correo"] is not None:
        values["correo"] = str(values["correo"]).lower()
        other = db.scalar(select(Participant.id).where(func.lower(Participant.correo) == values["correo"], Participant.id != participant_id))
        if other:
            raise HTTPException(status_code=409, detail="Ese correo ya está registrado")
    for key, value in values.items():
        if value is not None:
            setattr(u, key, value)
    db.commit()
    return participant_to_dict(get_participant(db, participant_id))


@app.delete("/api/usuarios/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_participant(
    participant_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = db.get(Participant, participant_id)
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    db.delete(u)
    db.commit()
    return None


@app.get("/api/pilotos", response_model=list[PilotOutput])
def list_pilots(
    activos: bool = True,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    stmt = select(Pilot).where(Pilot.activo.is_(True)) if activos else select(Pilot)
    return db.scalars(stmt.order_by(Pilot.nombre)).all()


@app.post("/api/pilotos", response_model=PilotOutput, status_code=201)
def create_pilot(
    data: PilotCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    nombre = " ".join(data.nombre.split())
    if db.scalar(select(Pilot.id).where(func.lower(Pilot.nombre) == nombre.lower())):
        raise HTTPException(status_code=409, detail="Ya existe un piloto con ese nombre")
    p = Pilot(nombre=nombre)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.patch("/api/usuarios/{participant_id}/piloto")
def assign_pilot(
    participant_id: int,
    piloto_id: int | None,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = db.get(Participant, participant_id)
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    if u.volado:
        raise HTTPException(status_code=409, detail="El participante ya voló; deshaz el vuelo antes de cambiar el piloto asignado")
    if piloto_id is None:
        u.piloto_asignado_id = None
    else:
        p = db.get(Pilot, piloto_id)
        if not p or not p.activo:
            raise HTTPException(status_code=404, detail="Piloto no encontrado o inactivo")
        u.piloto_asignado_id = p.id
    db.commit()
    return participant_to_dict(get_participant(db, participant_id))


@app.patch("/api/usuarios/{participant_id}/vuelo")
def set_flight(
    participant_id: int,
    volado: bool,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = db.get(Participant, participant_id)
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    if volado:
        if not u.piloto_asignado_id:
            raise HTTPException(status_code=409, detail="Asigna primero un piloto")
        u.volado = True
        u.volado_at = datetime.now(timezone.utc)
        u.piloto_vuelo_id = u.piloto_asignado_id
    else:
        u.volado = False
        u.volado_at = None
        u.piloto_vuelo_id = None
    db.commit()
    return participant_to_dict(get_participant(db, participant_id))


@app.put("/api/usuarios/{participant_id}/foto-video")
def upsert_photo_video(
    participant_id: int,
    data: PhotoVideoInput,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = db.get(Participant, participant_id)
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    medio = data.medio.strip()
    if not medio:
        raise HTTPException(status_code=422, detail="Selecciona un medio de pago")
    fv = db.scalar(select(PhotoVideo).where(PhotoVideo.usuario_id == participant_id))
    if fv is None:
        fv = PhotoVideo(usuario_id=participant_id, medio=medio, valor=Decimal(str(data.valor)), paid=bool(data.paid))
        db.add(fv)
    else:
        fv.medio = medio
        fv.valor = Decimal(str(data.valor))
        if data.paid is not None:
            fv.paid = data.paid
        fv.updated_at = datetime.now(timezone.utc)
    db.commit()
    return participant_to_dict(get_participant(db, participant_id))


@app.delete("/api/usuarios/{participant_id}/foto-video", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo_video(
    participant_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = db.get(Participant, participant_id)
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    fv = db.scalar(select(PhotoVideo).where(PhotoVideo.usuario_id == participant_id))
    if fv is None:
        raise HTTPException(status_code=404, detail="Ese participante no tiene el servicio")
    db.delete(fv)
    db.commit()
    return None


@app.patch("/api/usuarios/{participant_id}/foto-video/pago")
def update_payment(
    participant_id: int,
    data: PaymentUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    u = db.get(Participant, participant_id)
    if not u:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    fv = db.scalar(select(PhotoVideo).where(PhotoVideo.usuario_id == participant_id))
    if fv is None:
        raise HTTPException(status_code=404, detail="Ese participante no tiene servicio de foto/vídeo")
    fv.paid = data.paid
    fv.updated_at = datetime.now(timezone.utc)
    db.commit()
    return participant_to_dict(get_participant(db, participant_id))


@app.get("/api/resumen", response_model=SummaryOutput)
def summary(
    db: Session = Depends(get_db),
    _: Admin = Depends(get_current_admin),
):
    total = db.scalar(select(func.count(Participant.id))) or 0
    tierra = db.scalar(select(func.count(Participant.id)).where(Participant.volado.is_(False))) or 0
    volados = db.scalar(select(func.count(Participant.id)).where(Participant.volado.is_(True))) or 0
    count_fv = db.scalar(select(func.count(PhotoVideo.id))) or 0
    total_fv = db.scalar(select(func.coalesce(func.sum(PhotoVideo.valor), 0))) or 0
    paid_fv = db.scalar(select(func.coalesce(func.sum(PhotoVideo.valor), 0)).where(PhotoVideo.paid.is_(True))) or 0
    return SummaryOutput(
        total=total,
        en_tierra=tierra,
        volados=volados,
        con_foto_video=count_fv,
        total_foto_video=float(total_fv),
        pagado_foto_video=float(paid_fv),
        pendiente_foto_video=float(total_fv - paid_fv),
    )
