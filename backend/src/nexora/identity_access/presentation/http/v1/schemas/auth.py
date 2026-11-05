"""Contratos de entrada y salida de autenticacion.

Nunca se serializan modelos ORM ni campos internos como `hash_contrasena` o
`refresh_token_jti`. El refresh token viaja solo por cookie HttpOnly.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identificador: str = Field(min_length=1, max_length=255)
    contrasena: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("identificador")
    @classmethod
    def _identificador_no_vacio(cls, value: str) -> str:
        """Un identificador de solo espacios es una entrada invalida, no una credencial."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("El identificador no puede estar vacio")
        return normalized


class UsuarioResponse(BaseModel):
    id: UUID
    nombre_usuario: str
    correo: str
    nombre_completo: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  (esquema OAuth, no una credencial)
    expires_in: int


class LoginResponse(TokenResponse):
    usuario: UsuarioResponse


class MeResponse(BaseModel):
    usuario: UsuarioResponse
    roles: list[str]
    permisos: list[str]
