"""Contratos cerrados de autoservicio; nunca exponen credenciales ni sesiones."""

from __future__ import annotations

import re
from typing import Self

from pydantic import Field, SecretStr, field_validator, model_validator

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
    contrasena_nueva: SecretStr = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def _different_password(self) -> Self:
        if self.contrasena_actual.get_secret_value() == self.contrasena_nueva.get_secret_value():
            raise ValueError("La contrasena nueva debe ser diferente de la actual")
        return self
