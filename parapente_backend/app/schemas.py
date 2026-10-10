from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class TokenOutput(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ParticipantCreate(BaseModel):
    nombre: str = Field(min_length=3, max_length=160)
    correo: EmailStr
    tel: str = Field(min_length=7, max_length=40)
    peso: float = Field(ge=30, le=150)

    @field_validator("nombre")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("Escribe el nombre completo")
        return value

    @field_validator("tel")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if sum(ch.isdigit() for ch in value) < 7:
            raise ValueError("Teléfono no válido")
        return value.strip()


class ParticipantUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=160)
    correo: EmailStr | None = None
    tel: str | None = Field(default=None, min_length=7, max_length=40)
    peso: float | None = Field(default=None, ge=30, le=150)


class PilotCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)


class PilotOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    activo: bool
    created_at: datetime


class PhotoVideoInput(BaseModel):
    medio: str = Field(min_length=2, max_length=40)
    valor: float = Field(gt=0, le=100_000_000)
    paid: bool | None = None


class PaymentUpdate(BaseModel):
    paid: bool


class ParticipantOutput(BaseModel):
    id: int
    nombre: str
    correo: EmailStr
    tel: str
    peso: float
    createdAt: datetime
    volado: bool
    voladoAt: datetime | None
    pilotoAsignado: str | None
    pilotoVuelo: str | None
    fv: dict | None

    model_config = ConfigDict(from_attributes=True)


class SummaryOutput(BaseModel):
    total: int
    en_tierra: int
    volados: int
    con_foto_video: int
    total_foto_video: float
    pagado_foto_video: float
    pendiente_foto_video: float
