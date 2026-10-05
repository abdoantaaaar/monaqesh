from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str = Field(min_length=32)
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    session_days: int = Field(default=7, ge=1, le=30)
    cors_origins: list[str] = ["http://localhost:5173"]
    upload_dir: Path = Path("storage")
    max_upload_mb: int = Field(default=25, ge=1, le=100)

    @field_validator("secret_key")
    @classmethod
    def require_real_secret(cls, value: str) -> str:
        if value.startswith("replace-this"):
            raise ValueError("Generate SECRET_KEY before starting the application")
        return value

    @field_validator("database_url")
    @classmethod
    def select_psycopg_driver(cls, value: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return value.replace(prefix, "postgresql+psycopg://", 1)
        if not value.startswith(("postgresql+psycopg://", "sqlite:///")):
            raise ValueError("Use PostgreSQL with psycopg, or SQLite for local tests")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
