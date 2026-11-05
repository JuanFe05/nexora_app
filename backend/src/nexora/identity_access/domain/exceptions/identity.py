"""Errores del dominio IAM.

`InvalidCredentials` es deliberadamente generico: el usuario inexistente, el inactivo y la
contrasena incorrecta producen el mismo error para no filtrar informacion.
"""

from __future__ import annotations


class IdentityError(Exception):
    """Raiz de los errores del contexto de identidad y acceso."""


class InvalidCredentials(IdentityError):
    def __init__(self, message: str = "Credenciales invalidas") -> None:
        super().__init__(message)


class AuthenticationThrottled(IdentityError):
    """Demasiados intentos fallidos para la misma combinacion IP + identificador."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Demasiados intentos fallidos. Intente mas tarde.")
        self.retry_after_seconds = retry_after_seconds


class InvalidToken(IdentityError):
    def __init__(self, message: str = "Token invalido") -> None:
        super().__init__(message)


class SessionNotActive(IdentityError):
    """La sesion fue revocada, vencio o ya no existe."""

    def __init__(self, message: str = "Sesion no activa") -> None:
        super().__init__(message)


class RefreshTokenReused(IdentityError):
    """Se presento un refresh token que ya habia sido rotado: la sesion queda revocada."""

    def __init__(self, message: str = "Refresh token reutilizado") -> None:
        super().__init__(message)
