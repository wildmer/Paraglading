from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Admin(Base):
    __tablename__ = "admins"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Pilot(Base):
    __tablename__ = "pilotos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Participant(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        CheckConstraint("peso >= 30 AND peso <= 150", name="ck_usuario_peso_rango"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(160), nullable=False)
    correo: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    tel: Mapped[str] = mapped_column(String(40), nullable=False)
    peso: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    volado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    volado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    piloto_asignado_id: Mapped[int | None] = mapped_column(ForeignKey("pilotos.id", ondelete="SET NULL"), nullable=True)
    piloto_vuelo_id: Mapped[int | None] = mapped_column(ForeignKey("pilotos.id", ondelete="SET NULL"), nullable=True)

    piloto_asignado: Mapped["Pilot | None"] = relationship(foreign_keys=[piloto_asignado_id])
    piloto_vuelo: Mapped["Pilot | None"] = relationship(foreign_keys=[piloto_vuelo_id])
    foto_video: Mapped["PhotoVideo | None"] = relationship(back_populates="usuario", cascade="all, delete-orphan", uselist=False)


class PhotoVideo(Base):
    __tablename__ = "servicios_foto_video"
    __table_args__ = (
        UniqueConstraint("usuario_id", name="uq_fv_usuario"),
        CheckConstraint("valor > 0", name="ck_fv_valor_positivo"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    medio: Mapped[str] = mapped_column(String(40), nullable=False)
    valor: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    usuario: Mapped[Participant] = relationship(back_populates="foto_video")
