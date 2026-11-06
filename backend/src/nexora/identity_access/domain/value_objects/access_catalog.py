"""Catalogo de roles de sistema y permisos controlado por el backend (fuente unica).

La siembra de arranque lo materializa en `rol`, `permiso` y `rol_permiso`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class SystemRole(StrEnum):
    ADMINISTRADOR = "ADMINISTRADOR"
    ESTADISTICA = "ESTADISTICA"
    FACTURACION = "FACTURACION"


@dataclass(frozen=True, slots=True)
class RoleSpec:
    code: str
    name: str
    description: str


@dataclass(frozen=True, slots=True)
class PermissionSpec:
    code: str
    name: str
    module: str
    description: str


SYSTEM_ROLES: tuple[RoleSpec, ...] = (
    RoleSpec(SystemRole.ADMINISTRADOR, "Administrador", "Gestion total de identidad y acceso"),
    RoleSpec(SystemRole.ESTADISTICA, "Estadistica", "Consulta y analisis estadistico"),
    RoleSpec(SystemRole.FACTURACION, "Facturacion", "Gestion de facturacion"),
)


def _identity(code: str, name: str) -> PermissionSpec:
    return PermissionSpec(f"identity.{code}", name, "identity", name)


PERMISSION_CATALOG: tuple[PermissionSpec, ...] = (
    _identity("users.view", "Consultar usuarios"),
    _identity("users.create", "Crear usuarios"),
    _identity("users.update", "Editar usuarios"),
    _identity("users.deactivate", "Desactivar usuarios"),
    _identity("users.delete", "Eliminar usuarios"),
    _identity("users.reset_password", "Restablecer contrasenas"),
    _identity("users.assign_roles", "Asignar y revocar roles a usuarios"),
    _identity("roles.view", "Consultar roles"),
    _identity("roles.create", "Crear roles"),
    _identity("roles.update", "Editar roles"),
    _identity("roles.delete", "Eliminar roles"),
    _identity("roles.assign_permissions", "Asignar y revocar permisos a roles"),
    _identity("permissions.view", "Consultar permisos"),
    _identity("permissions.create", "Crear permisos"),
    _identity("permissions.update", "Editar permisos"),
    _identity("permissions.delete", "Eliminar permisos"),
)
