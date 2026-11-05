"""Repositorios SQLAlchemy asincronos del contexto IAM."""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.enums import RoleStatus
from nexora.identity_access.domain.value_objects.login_identifier import LoginIdentifier
from nexora.identity_access.infrastructure.persistence.mappers import (
    session_to_domain,
    session_to_model,
    user_to_domain,
)
from nexora.identity_access.infrastructure.persistence.models import (
    PermissionModel,
    RoleAssignmentModel,
    RoleModel,
    RolePermissionModel,
    SessionModel,
    UserModel,
)


class SqlAlchemyUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_login_identifier(self, identifier: LoginIdentifier) -> User | None:
        stmt = select(UserModel).where(
            or_(
                func.lower(UserModel.username) == identifier.value,
                func.lower(UserModel.email) == identifier.value,
            )
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return user_to_domain(model) if model is not None else None

    async def get_by_id(self, user_id: UUID) -> User | None:
        model = await self._session.get(UserModel, user_id)
        return user_to_domain(model) if model is not None else None


class SqlAlchemySessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, session: Session) -> None:
        self._session.add(session_to_model(session))
        await self._session.flush()

    async def get(self, session_id: UUID) -> Session | None:
        model = await self._session.get(SessionModel, session_id)
        return session_to_domain(model) if model is not None else None

    async def rotate_refresh_token(
        self,
        *,
        session_id: UUID,
        expected_jti: UUID,
        new_jti: UUID,
        expires_at: datetime,
        now: datetime,
    ) -> bool:
        """Rotacion atomica: una sola sentencia condicionada al JTI vigente."""
        stmt = (
            update(SessionModel)
            .where(
                SessionModel.id == session_id,
                SessionModel.refresh_token_jti == expected_jti,
                SessionModel.revoked_at.is_(None),
                SessionModel.expires_at > now,
            )
            .values(refresh_token_jti=new_jti, expires_at=expires_at, last_activity_at=now)
        )
        result = cast("CursorResult[Any]", await self._session.execute(stmt))
        return bool(result.rowcount)

    async def revoke(self, session_id: UUID, now: datetime) -> None:
        await self._session.execute(
            update(SessionModel)
            .where(SessionModel.id == session_id, SessionModel.revoked_at.is_(None))
            .values(revoked_at=now, last_activity_at=now)
        )

    async def touch(self, session_id: UUID, now: datetime) -> None:
        await self._session.execute(
            update(SessionModel).where(SessionModel.id == session_id).values(last_activity_at=now)
        )


class SqlAlchemyAccessRepository:
    """Permisos efectivos en una sola consulta: usuario -> asignacion_rol -> rol -> permiso."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def effective_access(self, user_id: UUID) -> tuple[tuple[str, ...], frozenset[str]]:
        stmt = (
            select(RoleModel.code, PermissionModel.code)
            .select_from(RoleAssignmentModel)
            .join(RoleModel, RoleModel.id == RoleAssignmentModel.role_id)
            .outerjoin(RolePermissionModel, RolePermissionModel.role_id == RoleModel.id)
            .outerjoin(PermissionModel, PermissionModel.id == RolePermissionModel.permission_id)
            .where(
                RoleAssignmentModel.user_id == user_id,
                RoleModel.status == RoleStatus.ACTIVE.value,
            )
        )
        rows = (await self._session.execute(stmt)).all()
        roles = sorted({role_code for role_code, _ in rows})
        permissions = {code for _, code in rows if code is not None}
        return tuple(roles), frozenset(permissions)
