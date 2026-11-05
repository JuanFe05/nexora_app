"""Configuracion central de la aplicacion.

Todos los valores sensibles y los tiempos de vida de los tokens viven aqui y se leen de
variables de entorno con el prefijo `NEXORA_`. Nunca se hardcodean en los casos de uso.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "testing", "production"]

#: Algoritmos de firma aceptados. El algoritmo jamas se toma del encabezado del token.
ALLOWED_JWT_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})

#: Secreto publico de desarrollo. Produccion debe reemplazarlo si o si.
DEVELOPMENT_JWT_SECRET = "development-only-secret-change-me"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXORA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "NEXORA"
    environment: Environment = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://nexora:nexora@localhost:5434/nexora"
    database_echo: bool = False
    allowed_origins: tuple[str, ...] = ("http://localhost:5173",)

    jwt_secret: SecretStr = SecretStr(DEVELOPMENT_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "nexora"
    jwt_audience: str = "nexora-app"
    access_token_ttl_minutes: int = 10
    refresh_token_ttl_days: int = 7

    refresh_cookie_name: str = "nexora_refresh_token"
    csrf_cookie_name: str = "nexora_csrf_token"
    csrf_header_name: str = "X-CSRF-Token"
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None
    #: La cookie CSRF debe ser legible desde cualquier ruta del front, no solo desde /api/v1/auth.
    csrf_cookie_path: str = "/"

    login_max_attempts: int = 5
    login_attempt_window_seconds: int = 300
    login_block_seconds: int = 900

    @field_validator("jwt_algorithm")
    @classmethod
    def _validate_jwt_algorithm(cls, value: str) -> str:
        if value not in ALLOWED_JWT_ALGORITHMS:
            allowed = ", ".join(sorted(ALLOWED_JWT_ALGORITHMS))
            raise ValueError(f"jwt_algorithm debe ser uno de: {allowed}")
        return value

    @model_validator(mode="after")
    def _require_strong_secret_in_production(self) -> Settings:
        if self.environment != "production":
            return self
        secret = self.jwt_secret.get_secret_value()
        if secret == DEVELOPMENT_JWT_SECRET:
            raise ValueError("NEXORA_JWT_SECRET no puede ser el secreto de desarrollo")
        if len(secret) < 32:
            raise ValueError("NEXORA_JWT_SECRET debe tener al menos 32 caracteres en produccion")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cookie_secure(self) -> bool:
        """La cookie de refresh solo viaja por HTTPS fuera de desarrollo."""
        return self.is_production

    @property
    def cookie_path(self) -> str:
        """La cookie de refresh no se envia a endpoints que no la necesitan."""
        return f"{self.api_prefix}/auth"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
