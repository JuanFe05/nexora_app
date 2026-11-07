"""Configuracion central de la aplicacion.

Todos los valores sensibles y los tiempos de vida de los tokens viven aqui y se leen de
variables de entorno con el prefijo `NEXORA_`. Nunca se hardcodean en los casos de uso.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from nexora.identity_access.domain.value_objects.password_policy import validate_password_policy

Environment = Literal["development", "testing", "production"]

#: El .env vive en la raiz del repositorio, junto al docker-compose.yml. Se resuelve por ruta
#: absoluta para que funcione igual al ejecutar desde la raiz o desde backend/.
_BACKEND_DIR = Path(__file__).resolve().parents[3]
_REPO_ROOT = _BACKEND_DIR.parent

#: Algoritmos de firma aceptados. El algoritmo jamas se toma del encabezado del token.
ALLOWED_JWT_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})

#: Secreto publico de desarrollo. Produccion debe reemplazarlo si o si.
DEVELOPMENT_JWT_SECRET = "development-only-secret-change-me"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXORA_",
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "NEXORA"
    environment: Environment = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://nexora:nexora@localhost:45336/nexora"
    database_echo: bool = False
    allowed_origins: tuple[str, ...] = ("http://localhost:5173",)

    jwt_secret: SecretStr = SecretStr(DEVELOPMENT_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "nexora"
    jwt_audience: str = "nexora-app"
    access_token_ttl_minutes: int = 10
    refresh_token_ttl_days: int = 7
    session_idle_timeout_minutes: int = Field(default=30, gt=0, le=1440)
    session_absolute_timeout_hours: int = Field(default=12, gt=0, le=168)
    session_warning_seconds: int = Field(default=120, gt=0, ge=10, le=600)
    refresh_rotation_grace_seconds: int = Field(default=30, gt=0, le=300)
    session_activity_touch_seconds: int = Field(default=60, gt=0, le=300)

    @model_validator(mode="after")
    def _validate_session_timeouts(self) -> Settings:
        if self.session_idle_timeout_minutes > self.session_absolute_timeout_hours * 60:
            raise ValueError("La inactividad no puede superar el limite absoluto de sesion")
        # La actividad se escribe con un retraso de hasta `touch` segundos: debe caber dos veces
        # en la ventana de inactividad, o un usuario activo podria vencer sin registrar actividad.
        if self.session_idle_timeout_minutes * 60 < 2 * self.session_activity_touch_seconds:
            raise ValueError("La inactividad debe ser al menos el doble del umbral de actividad")
        # El front renueva el access token (y con ello la actividad) cerca de su vencimiento.
        if self.session_idle_timeout_minutes <= self.access_token_ttl_minutes:
            raise ValueError("La inactividad debe ser mayor que la vigencia del access token")
        if self.session_warning_seconds >= self.session_idle_timeout_minutes * 60:
            raise ValueError("El aviso debe ser menor que el tiempo de inactividad")
        return self

    refresh_cookie_name: str = "nexora_refresh_token"
    csrf_cookie_name: str = "nexora_csrf_token"
    csrf_header_name: str = "X-CSRF-Token"
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None
    #: La cookie CSRF debe ser legible desde cualquier ruta del front, no solo desde /api/v1/auth.
    csrf_cookie_path: str = "/"

    #: Credenciales del primer administrador. Sin valores por defecto: jamas viven en el codigo.
    bootstrap_admin_username: str | None = None
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: SecretStr | None = None
    bootstrap_admin_first_name: str = "Administrador"
    bootstrap_admin_last_name: str = "NEXORA"
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
    def _validate_bootstrap_admin(self) -> Settings:
        password = self.bootstrap_admin_password
        provided = [
            bool(self.bootstrap_admin_username),
            bool(self.bootstrap_admin_email),
            bool(password and password.get_secret_value()),
        ]
        if any(provided) and not all(provided):
            raise ValueError(
                "El administrador inicial exige NEXORA_BOOTSTRAP_ADMIN_USERNAME, _EMAIL y _PASSWORD"
            )
        if password is not None and all(provided):
            validate_password_policy(password.get_secret_value())
        return self

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
    def has_bootstrap_admin(self) -> bool:
        return self.bootstrap_admin_password is not None and bool(self.bootstrap_admin_username)

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
