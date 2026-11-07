"""DTOs del flujo de autenticacion. No exponen `hash_contrasena` ni el JTI almacenado."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class LoginCommand:
    identifier: str
    password: str
    ip_address: str | None = None
    user_agent: str | None = None


@dataclass(frozen=True, slots=True)
class UserView:
    id: UUID
    username: str
    email: str
    full_name: str


@dataclass(frozen=True, slots=True)
class IssuedTokens:
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_expires_at: datetime
    session_id: UUID
    idle_timeout_seconds: int
    warning_seconds: int
    session_expires_at: datetime
    token_type: str = "bearer"  # noqa: S105  (nombre del esquema, no un secreto)


@dataclass(frozen=True, slots=True)
class LoginResult:
    tokens: IssuedTokens
    user: UserView


@dataclass(frozen=True, slots=True)
class AuthenticatedPrincipal:
    """Usuario autenticado con su sesion viva y sus permisos efectivos actuales."""

    user: UserView
    session_id: UUID
    roles: tuple[str, ...] = field(default_factory=tuple)
    permissions: frozenset[str] = field(default_factory=frozenset)

    def has_permission(self, code: str) -> bool:
        return code in self.permissions
