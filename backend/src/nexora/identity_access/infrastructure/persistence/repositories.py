"""Repositorios SQLAlchemy asincronos del contexto IAM."""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import CursorResult, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.access_catalog import PermissionSpec, RoleSpec
from nexora.identity_access.domain.value_objects.enums import RoleStatus, UserStatus
from nexora.identity_access.domain.value_objects.login_identifier import LoginIdentifier
from nexora.identity_access.infrastructure.persistence.mappers import (
    session_to_domain,
    session_to_model,
    user_to_domain,
    user_to_model,
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


#: Clave del advisory lock que serializa la siembra entre workers.
_SEED_LOCK_KEY = 726_345_001


class SqlAlchemyAccessSeedRepository:
    """Siembra idempotente: INSERT ... ON CONFLICT DO NOTHING y lectura del id resultante."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def acquire_seed_lock(self) -> None:
        await self._session.execute(select(func.pg_advisory_xact_lock(_SEED_LOCK_KEY)))

    async def ensure_role(self, spec: RoleSpec) -> UUID:
        await self._session.execute(
            pg_insert(RoleModel)
            .values(
                id=uuid4(),
                code=spec.code,
                name=spec.name,
                description=spec.description,
                status=RoleStatus.ACTIVE.value,
            )
            .on_conflict_do_nothing(index_elements=[RoleModel.code])
        )
        return (
            await self._session.execute(select(RoleModel.id).where(RoleModel.code == spec.code))
        ).scalar_one()

    async def ensure_permission(self, spec: PermissionSpec) -> UUID:
        await self._session.execute(
            pg_insert(PermissionModel)
            .values(
                id=uuid4(),
                code=spec.code,
                name=spec.name,
                description=spec.description,
                module=spec.module,
            )
            .on_conflict_do_nothing(index_elements=[PermissionModel.code])
        )
        return (
            await self._session.execute(
                select(PermissionModel.id).where(PermissionModel.code == spec.code)
            )
        ).scalar_one()

    async def ensure_role_permission(self, role_id: UUID, permission_id: UUID) -> None:
        await self._session.execute(
            pg_insert(RolePermissionModel)
            .values(role_id=role_id, permission_id=permission_id)
            .on_conflict_do_nothing()
        )

    async def count_active_users_with_role(self, role_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(RoleAssignmentModel)
            .join(UserModel, UserModel.id == RoleAssignmentModel.user_id)
            .join(RoleModel, RoleModel.id == RoleAssignmentModel.role_id)
            .where(
                RoleAssignmentModel.role_id == role_id,
                RoleModel.status == RoleStatus.ACTIVE.value,
                UserModel.status == UserStatus.ACTIVE.value,
            )
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def find_user(self, *, username: str, email: str) -> User | None:
        stmt = select(UserModel).where(
            or_(
                func.lower(UserModel.username) == username.lower(),
                func.lower(UserModel.email) == email.lower(),
            )
        )
        model = (await self._session.execute(stmt)).scalars().first()
        return user_to_domain(model) if model is not None else None

    async def add_user(self, user: User) -> None:
        self._session.add(user_to_model(user))
        await self._session.flush()

    async def ensure_assignment(self, user_id: UUID, role_id: UUID) -> None:
        await self._session.execute(
            pg_insert(RoleAssignmentModel)
            .values(user_id=user_id, role_id=role_id, assigned_by=None)
            .on_conflict_do_nothing()
        )
