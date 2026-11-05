"""Estados del dominio IAM. Los valores coinciden con los almacenados en PostgreSQL."""

from __future__ import annotations

from enum import StrEnum


class UserStatus(StrEnum):
    ACTIVE = "activo"
    INACTIVE = "inactivo"


class RoleStatus(StrEnum):
    ACTIVE = "activo"
    INACTIVE = "inactivo"
