"""Contratos de persistencia que necesita la capa de aplicacion."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from nexora.identity_access.application.dto.session import SessionRead
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.login_identifier import LoginIdentifier


class UserRepository(Protocol):
    async def get_by_login_identifier(self, identifier: LoginIdentifier) -> User | None: ...

    async def get_by_id(self, user_id: UUID) -> User | None: ...

    async def get_for_update(self, user_id: UUID) -> User | None:
        """Relee el usuario y serializa sus escrituras hasta finalizar la transaccion."""
        ...

    async def update_password(
        self, user_id: UUID, password_hash: str, changed_at: datetime
    ) -> None: ...


class SessionRepository(Protocol):
    async def add(self, session: Session) -> None: ...

    async def get(self, session_id: UUID) -> Session | None: ...

    async def get_owned_for_update(self, session_id: UUID, user_id: UUID) -> Session | None:
        """Relee y bloquea la sesion SOLO si pertenece al usuario, hasta finalizar la transaccion.

        El filtro por propietario va en la misma consulta: una fila ajena nunca se bloquea ni se
        espera, de modo que su existencia no es observable por tiempo de respuesta.
        """
        ...

    async def list_usable(
        self, user_id: UUID, now: datetime, idle_timeout: timedelta
    ) -> list[SessionRead]:
        """Una consulta sin secretos, filtrada por propietario/politica, actividad descendente."""
        ...

    async def rotate_refresh_token(
        self,
        *,
        session_id: UUID,
        expected_jti: UUID,
        new_jti: UUID,
        now: datetime,
        idle_timeout: timedelta,
        rotation_grace: timedelta,
    ) -> bool:
        """UPDATE atomico: sesion usable y JTI vigente o anterior dentro de la gracia.

        Conserva el limite absoluto, mueve vigente a anterior y actualiza actividad/rotacion.
        """
        ...

    async def revoke(self, session_id: UUID, now: datetime) -> None: ...

    async def touch(
        self,
        session_id: UUID,
        now: datetime,
        *,
        idle_timeout: timedelta,
        activity_touch_interval: timedelta,
    ) -> None: ...

    async def revoke_all_for_user(self, user_id: UUID, now: datetime) -> None: ...

    async def revoke_all_except(
        self, user_id: UUID, keep_session_id: UUID, now: datetime
    ) -> None: ...


class AccessRepository(Protocol):
    """Lectura de roles y permisos efectivos: usuario -> asignacion_rol -> rol -> permiso."""

    async def effective_access(self, user_id: UUID) -> tuple[tuple[str, ...], frozenset[str]]: ...
