"""Repositorio SQLAlchemy de administracion de usuarios, roles y permisos."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.domain.entities.role import Permission, Role
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.access_catalog import SystemRole
from nexora.identity_access.domain.value_objects.enums import UserStatus
from nexora.identity_access.infrastructure.persistence.mappers import (
    permission_to_domain,
    role_to_domain,
    user_to_domain,
    user_to_model,
)
from nexora.identity_access.infrastructure.persistence.models import (
    PermissionModel,
    RoleAssignmentModel,
    RoleModel,
    RolePermissionModel,
    UserModel,
)

#: Serializa las operaciones que podrian dejar al sistema sin administrador activo.
_ADMIN_LOCK_KEY = 726_345_002


class SqlAlchemyAdministrationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # --- Proteccion del ultimo administrador ---------------------------------------------

    async def lock_administrators(self) -> None:
        await self._session.execute(select(func.pg_advisory_xact_lock(_ADMIN_LOCK_KEY)))

    def _active_admins(self) -> Any:
        return (
            select(UserModel.id)
            .join(RoleAssignmentModel, RoleAssignmentModel.user_id == UserModel.id)
            .join(RoleModel, RoleModel.id == RoleAssignmentModel.role_id)
            .where(
                RoleModel.code == SystemRole.ADMINISTRADOR.value,
                RoleModel.status == "activo",
                UserModel.status == UserStatus.ACTIVE.value,
            )
        )

    async def count_active_administrators(self) -> int:
        subquery = self._active_admins().subquery()
        return int(
            (await self._session.execute(select(func.count()).select_from(subquery))).scalar_one()
        )

    async def is_active_administrator(self, user_id: UUID) -> bool:
        stmt = self._active_admins().where(UserModel.id == user_id)
        return (await self._session.execute(stmt)).first() is not None

    # --- Usuarios --------------------------------------------------------------------------

    async def add_user(self, user: User) -> None:
        self._session.add(user_to_model(user))
        await self._session.flush()

    async def update_user(self, user: User) -> None:
        model = await self._session.get(UserModel, user.id)
        assert model is not None  # noqa: S101
        model.username = user.username
        model.email = user.email
        model.first_name = user.first_name
        model.middle_name = user.middle_name
        model.last_name = user.last_name
        model.second_last_name = user.second_last_name
        model.phone_number = user.phone_number
        model.status = user.status.value
        await self._session.flush()

    async def delete_user(self, user_id: UUID) -> None:
        await self._session.execute(delete(UserModel).where(UserModel.id == user_id))

    async def get_user(self, user_id: UUID) -> User | None:
        model = await self._session.get(UserModel, user_id)
        return user_to_domain(model) if model is not None else None

    async def find_user(self, *, username: str, email: str) -> list[User]:
        stmt = select(UserModel).where(
            (func.lower(UserModel.username) == username.lower())
            | (func.lower(UserModel.email) == email.lower())
        )
        return [user_to_domain(model) for model in (await self._session.execute(stmt)).scalars()]

    async def list_users(self, *, limit: int, offset: int) -> list[User]:
        stmt = select(UserModel).order_by(UserModel.username).limit(limit).offset(offset)
        return [user_to_domain(model) for model in (await self._session.execute(stmt)).scalars()]

    # --- Roles -----------------------------------------------------------------------------

    async def add_role(self, role: Role) -> None:
        self._session.add(
            RoleModel(
                id=role.id,
                code=role.code,
                name=role.name,
                description=role.description,
                status=role.status.value,
            )
        )
        await self._session.flush()

    async def update_role(self, role: Role) -> None:
        model = await self._session.get(RoleModel, role.id)
        assert model is not None  # noqa: S101
        model.name = role.name
        model.description = role.description
        model.status = role.status.value
        await self._session.flush()

    async def delete_role(self, role_id: UUID) -> None:
        await self._session.execute(delete(RoleModel).where(RoleModel.id == role_id))

    async def get_role(self, role_id: UUID) -> Role | None:
        model = await self._session.get(RoleModel, role_id)
        return role_to_domain(model) if model is not None else None

    async def get_role_by_code(self, code: str) -> Role | None:
        stmt = select(RoleModel).where(RoleModel.code == code)
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return role_to_domain(model) if model is not None else None

    async def list_roles(self, *, limit: int, offset: int) -> list[Role]:
        stmt = select(RoleModel).order_by(RoleModel.code).limit(limit).offset(offset)
        return [role_to_domain(model) for model in (await self._session.execute(stmt)).scalars()]

    async def count_role_assignments(self, role_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(RoleAssignmentModel)
            .where(RoleAssignmentModel.role_id == role_id)
        )
        return int((await self._session.execute(stmt)).scalar_one())

    # --- Permisos --------------------------------------------------------------------------

    async def add_permission(self, permission: Permission) -> None:
        self._session.add(
            PermissionModel(
                id=permission.id,
                code=permission.code,
                name=permission.name,
                description=permission.description,
                module=permission.module,
            )
        )
        await self._session.flush()

    async def update_permission(self, permission: Permission) -> None:
        model = await self._session.get(PermissionModel, permission.id)
        assert model is not None  # noqa: S101
        model.name = permission.name
        model.description = permission.description
        model.module = permission.module
        await self._session.flush()

    async def delete_permission(self, permission_id: UUID) -> None:
        await self._session.execute(
            delete(PermissionModel).where(PermissionModel.id == permission_id)
        )

    async def get_permission(self, permission_id: UUID) -> Permission | None:
        model = await self._session.get(PermissionModel, permission_id)
        return permission_to_domain(model) if model is not None else None

    async def get_permission_by_code(self, code: str) -> Permission | None:
        stmt = select(PermissionModel).where(PermissionModel.code == code)
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return permission_to_domain(model) if model is not None else None

    async def list_permissions(self, *, limit: int, offset: int) -> list[Permission]:
        stmt = select(PermissionModel).order_by(PermissionModel.code).limit(limit).offset(offset)
        return [
            permission_to_domain(model) for model in (await self._session.execute(stmt)).scalars()
        ]

    async def count_permission_roles(self, permission_id: UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(RolePermissionModel)
            .where(RolePermissionModel.permission_id == permission_id)
        )
        return int((await self._session.execute(stmt)).scalar_one())

    # --- Relaciones ------------------------------------------------------------------------

    async def assign_role(self, user_id: UUID, role_id: UUID, assigned_by: UUID) -> None:
        await self._session.execute(
            pg_insert(RoleAssignmentModel)
            .values(user_id=user_id, role_id=role_id, assigned_by=assigned_by)
            .on_conflict_do_nothing()
        )

    async def revoke_role(self, user_id: UUID, role_id: UUID) -> bool:
        result = cast(
            "CursorResult[Any]",
            await self._session.execute(
                delete(RoleAssignmentModel).where(
                    RoleAssignmentModel.user_id == user_id, RoleAssignmentModel.role_id == role_id
                )
            ),
        )
        return bool(result.rowcount)

    async def assign_permission(self, role_id: UUID, permission_id: UUID) -> None:
        await self._session.execute(
            pg_insert(RolePermissionModel)
            .values(role_id=role_id, permission_id=permission_id)
            .on_conflict_do_nothing()
        )

    async def revoke_permission(self, role_id: UUID, permission_id: UUID) -> bool:
        result = cast(
            "CursorResult[Any]",
            await self._session.execute(
                delete(RolePermissionModel).where(
                    RolePermissionModel.role_id == role_id,
                    RolePermissionModel.permission_id == permission_id,
                )
            ),
        )
        return bool(result.rowcount)

    async def role_codes_by_user(self, user_ids: Collection[UUID]) -> dict[UUID, tuple[str, ...]]:
        stmt = (
            select(RoleAssignmentModel.user_id, RoleModel.code)
            .join(RoleModel, RoleModel.id == RoleAssignmentModel.role_id)
            .where(RoleAssignmentModel.user_id.in_(user_ids))
            .order_by(RoleModel.code)
        )
        grouped: dict[UUID, list[str]] = defaultdict(list)
        for user_id, code in (await self._session.execute(stmt)).all():
            grouped[user_id].append(code)
        return {key: tuple(value) for key, value in grouped.items()}

    async def permission_codes_by_role(
        self, role_ids: Collection[UUID]
    ) -> dict[UUID, tuple[str, ...]]:
        stmt = (
            select(RolePermissionModel.role_id, PermissionModel.code)
            .join(PermissionModel, PermissionModel.id == RolePermissionModel.permission_id)
            .where(RolePermissionModel.role_id.in_(role_ids))
            .order_by(PermissionModel.code)
        )
        grouped: dict[UUID, list[str]] = defaultdict(list)
        for role_id, code in (await self._session.execute(stmt)).all():
            grouped[role_id].append(code)
        return {key: tuple(value) for key, value in grouped.items()}
