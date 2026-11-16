from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: str = "development"
    PORT: int = 8080
    DATABASE_URL: str = "sqlite+aiosqlite:///./orders.db"
    SYNC_DATABASE_URL: str = "sqlite:///./orders.db"
    JWT_SECRET: str = "change-me-long-random-secret-key-at-least-32-chars"
    JWT_EXPIRES_IN: str = "8h"
    CORS_ORIGIN: str = "http://localhost:5173"
    SERVICEBUS_CONNECTION_STRING: str = ""
    SB_TOPIC_NAME: str = "order-events"
    SB_MAX_CONCURRENT_CALLS: int = 5
    SENDGRID_API_KEY: Optional[str] = None
    MAIL_FROM: str = "orders@example.com"
    APPLICATIONINSIGHTS_CONNECTION_STRING: Optional[str] = None
    USE_IN_MEMORY_BUS: bool = True

    @field_validator("PORT")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if v < 1 or v > 65535:
            raise ValueError("PORT must be between 1 and 65535")
        return v

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("JWT_SECRET must be at least 16 characters long")
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("DATABASE_URL must not be empty")
        return v

    @field_validator("SB_MAX_CONCURRENT_CALLS")
    @classmethod
    def validate_concurrent_calls(cls, v: int) -> int:
        if v < 1:
            raise ValueError("SB_MAX_CONCURRENT_CALLS must be at least 1")
        return v


def get_settings() -> Settings:
    try:
        return Settings()
    except Exception as exc:
        print(f"FATAL: Environment configuration validation error:\n{exc}")
        raise


settings = get_settings()
