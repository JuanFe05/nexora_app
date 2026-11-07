"""Contratos de servicios tecnicos de seguridad."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password_hash: str, password: str) -> bool: ...

    def dummy_verify(self) -> None:
        """Consume tiempo equivalente a una verificacion real.

        Evita que el tiempo de respuesta revele si el usuario existe.
        """
        ...


@dataclass(frozen=True, slots=True)
class AccessTokenClaims:
    user_id: UUID
    session_id: UUID
    token_id: UUID
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class RefreshTokenClaims:
    user_id: UUID
    session_id: UUID
    token_id: UUID
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class IssuedToken:
    value: str
    token_id: UUID
    expires_at: datetime


class TokenService(Protocol):
    def issue_access_token(
        self, *, user_id: UUID, session_id: UUID, now: datetime
    ) -> IssuedToken: ...

    def issue_refresh_token(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        now: datetime,
        absolute_expires_at: datetime | None = None,
    ) -> IssuedToken: ...

    def decode_access_token(self, token: str) -> AccessTokenClaims: ...

    def decode_refresh_token(
        self, token: str, *, allow_expired: bool = False
    ) -> RefreshTokenClaims:
        """allow_expired permite revocar una sesion vencida, nunca autenticar sin validar exp."""
        ...


class LoginThrottle(Protocol):
    """Freno a la fuerza bruta por combinacion IP + identificador."""

    def ensure_allowed(self, key: str) -> None: ...

    def register_failure(self, key: str) -> None: ...

    def reset(self, key: str) -> None: ...


class Clock(Protocol):
    def now(self) -> datetime: ...
