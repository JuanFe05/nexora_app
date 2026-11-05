"""Contratos de persistencia que necesita la capa de aplicacion."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.login_identifier import LoginIdentifier


class UserRepository(Protocol):
    async def get_by_login_identifier(self, identifier: LoginIdentifier) -> User | None: ...

    async def get_by_id(self, user_id: UUID) -> User | None: ...


class SessionRepository(Protocol):
    async def add(self, session: Session) -> None: ...

    async def get(self, session_id: UUID) -> Session | None: ...

    async def rotate_refresh_token(
        self,
        *,
        session_id: UUID,
        expected_jti: UUID,
        new_jti: UUID,
        expires_at: datetime,
        now: datetime,
    ) -> bool:
        """Rota el JTI en una sola sentencia atomica.

        Devuelve False cuando la sesion no esta activa o el JTI presentado no es el vigente,
        que es como se detecta la reutilizacion de un refresh token.
        """
        ...

    async def revoke(self, session_id: UUID, now: datetime) -> None: ...

    async def touch(self, session_id: UUID, now: datetime) -> None: ...


class AccessRepository(Protocol):
    """Lectura de roles y permisos efectivos: usuario -> asignacion_rol -> rol -> permiso."""

    async def effective_access(self, user_id: UUID) -> tuple[tuple[str, ...], frozenset[str]]: ...
