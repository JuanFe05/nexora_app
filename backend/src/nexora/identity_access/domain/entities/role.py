"""Roles y permisos como entidades de dominio."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from nexora.identity_access.domain.value_objects.enums import RoleStatus


@dataclass(frozen=True, slots=True)
class Role:
    id: UUID
    code: str
    name: str
    status: RoleStatus
    description: str | None = None

    @property
    def is_active(self) -> bool:
        return self.status is RoleStatus.ACTIVE


@dataclass(frozen=True, slots=True)
class Permission:
    id: UUID
    code: str
    name: str
    module: str
    description: str | None = None
