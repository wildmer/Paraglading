from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# Resuelve la ruta del archivo SQLite por defecto junto al paquete de la app.
_DEFAULT_DB_PATH = (Path(__file__).resolve().parent.parent / "parapente.db").as_posix()


class Settings(BaseSettings):
    app_name: str = "Parapente API"
    environment: str = "development"
    database_url: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    secret_key: str = "CAMBIA_ESTE_SECRETO_EN_PRODUCCION_" + "x" * 40
    access_token_minutes: int = 480
    admin_username: str = "admin1"
    admin_password: str = "CambiaEstaClave123!"
    super_admin_username: str = "admin"
    super_admin_password: str = "CambiaEstaClave123!"
    user_username: str = "user"
    user_password: str = "CambiaEstaClave123!"
    frontend_origins: str = "http://127.0.0.1:5500,http://localhost:5500"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


settings = Settings()
