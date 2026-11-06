"""Contrato de persistencia de la siembra de roles, permisos y administrador."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.access_catalog import PermissionSpec, RoleSpec


class AccessSeedRepository(Protocol):
    async def acquire_seed_lock(self) -> None:
        """Serializa siembras concurrentes (varios workers) hasta el fin de la transaccion."""
        ...

    async def ensure_role(self, spec: RoleSpec) -> UUID: ...

    async def ensure_permission(self, spec: PermissionSpec) -> UUID: ...

    async def ensure_role_permission(self, role_id: UUID, permission_id: UUID) -> None: ...

    async def count_active_users_with_role(self, role_id: UUID) -> int: ...

    async def find_user(self, *, username: str, email: str) -> User | None: ...

    async def add_user(self, user: User) -> None: ...

    async def ensure_assignment(self, user_id: UUID, role_id: UUID) -> None: ...
