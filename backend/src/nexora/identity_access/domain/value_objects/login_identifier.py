"""Identificador de inicio de sesion: puede ser nombre de usuario o correo."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class LoginIdentifier:
    """Normaliza el identificador recibido para que la busqueda sea deterministica."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if not normalized:
            raise ValueError("El identificador no puede estar vacio")
        object.__setattr__(self, "value", normalized)

    @property
    def looks_like_email(self) -> bool:
        return "@" in self.value
