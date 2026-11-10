"""Contratos IAM en espanol; los hashes y otros detalles internos nunca se serializan."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
)

from nexora.identity_access.application.use_cases.administration import RoleDetail, UserDetail
from nexora.identity_access.domain.entities.role import Permission
from nexora.identity_access.domain.value_objects.enums import RoleStatus, UserStatus
from nexora.identity_access.domain.value_objects.password_policy import validate_password_policy
from nexora.identity_access.domain.value_objects.personal_data import validate_phone

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Email = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
#: Solo digitos ASCII (0-9), exactamente 10; sin strip: espacios, signos y prefijos se rechazan.
Phone = Annotated[str, AfterValidator(validate_phone)]
Module = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
RoleCode = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Z][A-Z0-9_]{1,49}$")
]
PermissionCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        max_length=100,
        pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$",
    ),
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserCreate(Contract):
    nombre_usuario: Username
    correo: Email
    primer_nombre: Name
    primer_apellido: Name
    contrasena: SecretStr
    segundo_nombre: Name | None = None
    segundo_apellido: Name | None = None
    numero_telefono: Phone | None = None

    @field_validator("contrasena")
    @classmethod
    def _password_policy(cls, value: SecretStr) -> SecretStr:
        validate_password_policy(value.get_secret_value())
        return value


class PatchContract(Contract):
    @field_validator("*", mode="before")
    @classmethod
    def _reject_explicit_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Los campos PATCH no admiten null; omita el campo para no cambiarlo")
        return value


class UserUpdate(PatchContract):
    nombre_usuario: Username | None = None
    correo: Email | None = None
    primer_nombre: Name | None = None
    segundo_nombre: Name | None = None
    primer_apellido: Name | None = None
    segundo_apellido: Name | None = None
    numero_telefono: Phone | None = None
    estado: UserStatus | None = None


class UserResponse(Contract):
    id: UUID
    nombre_usuario: str
    correo: str
    primer_nombre: str
    segundo_nombre: str | None
    primer_apellido: str
    segundo_apellido: str | None
    numero_telefono: str | None
    estado: UserStatus
    roles: tuple[str, ...]

    @classmethod
    def from_detail(cls, detail: UserDetail) -> UserResponse:
        user = detail.user
        return cls(
            id=user.id,
            nombre_usuario=user.username,
            correo=user.email,
            primer_nombre=user.first_name,
            segundo_nombre=user.middle_name,
            primer_apellido=user.last_name,
            segundo_apellido=user.second_last_name,
            numero_telefono=user.phone_number,
            estado=user.status,
            roles=detail.roles,
        )


class RoleCreate(Contract):
    codigo: RoleCode
    nombre: Name
    descripcion: Description | None = None


class RoleUpdate(PatchContract):
    nombre: Name | None = None
    descripcion: Description | None = None
    estado: RoleStatus | None = None


class RoleResponse(Contract):
    id: UUID
    codigo: str
    nombre: str
    descripcion: str | None
    estado: RoleStatus
    permisos: tuple[str, ...]
    usuarios_asignados: int = Field(ge=0, description="Usuarios con el rol, incluidos inactivos")

    @classmethod
    def from_detail(cls, detail: RoleDetail) -> RoleResponse:
        role = detail.role
        return cls(
            id=role.id,
            codigo=role.code,
            nombre=role.name,
            descripcion=role.description,
            estado=role.status,
            permisos=detail.permissions,
            usuarios_asignados=detail.assigned_users,
        )


class PermissionCreate(Contract):
    codigo: PermissionCode
    nombre: Name
    modulo: Module
    descripcion: Description | None = None


class PermissionUpdate(PatchContract):
    nombre: Name | None = None
    modulo: Module | None = None
    descripcion: Description | None = None


class PermissionResponse(Contract):
    id: UUID
    codigo: str
    nombre: str
    modulo: str
    descripcion: str | None

    @classmethod
    def from_permission(cls, permission: Permission) -> PermissionResponse:
        return cls(
            id=permission.id,
            codigo=permission.code,
            nombre=permission.name,
            modulo=permission.module,
            descripcion=permission.description,
        )
