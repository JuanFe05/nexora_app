"""Contratos cerrados de autoservicio; nunca exponen credenciales."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import Field, SecretStr, field_validator, model_validator

from nexora.identity_access.application.dto.session import SessionRead
from nexora.identity_access.domain.value_objects.password_policy import validate_password_policy
from nexora.identity_access.presentation.http.v1.schemas.administration import (
    Contract,
    Email,
    Name,
    PatchContract,
    Phone,
    UserResponse,
)


class ProfileResponse(UserResponse):
    """La misma vista publica de usuario, sin campos internos."""


class SessionResponse(Contract):
    id: UUID
    direccion_ip: str | None
    agente_usuario: str | None
    fecha_creacion: datetime
    fecha_ultima_actividad: datetime
    fecha_vencimiento: datetime
    actual: bool

    @classmethod
    def from_read(cls, item: SessionRead) -> Self:
        return cls(
            id=item.id,
            direccion_ip=item.ip_address,
            agente_usuario=item.user_agent,
            fecha_creacion=item.created_at,
            fecha_ultima_actividad=item.last_activity_at,
            fecha_vencimiento=item.expires_at,
            actual=item.current,
        )


class SessionListResponse(Contract):
    items: list[SessionResponse]


class ProfileUpdate(PatchContract):
    correo: Email | None = None
    primer_nombre: Name | None = None
    segundo_nombre: Name | None = None
    primer_apellido: Name | None = None
    segundo_apellido: Name | None = None
    numero_telefono: Phone | None = None

    @field_validator("correo")
    @classmethod
    def _email_format(cls, value: str | None) -> str | None:
        if value is not None and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is None:
            raise ValueError("El correo debe tener un formato valido")
        return value


class PasswordUpdate(Contract):
    contrasena_actual: SecretStr = Field(min_length=1, max_length=128)
    contrasena_nueva: SecretStr

    @field_validator("contrasena_nueva")
    @classmethod
    def _password_policy(cls, value: SecretStr) -> SecretStr:
        validate_password_policy(value.get_secret_value())
        return value

    @model_validator(mode="after")
    def _different_password(self) -> Self:
        if self.contrasena_actual.get_secret_value() == self.contrasena_nueva.get_secret_value():
            raise ValueError("La contrasena nueva debe ser diferente de la actual")
        return self
