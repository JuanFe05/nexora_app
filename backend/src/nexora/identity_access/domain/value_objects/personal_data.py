"""Normalizacion canonica de datos personales antes de persistirlos.

Se aplica en la capa de aplicacion para que PostgreSQL guarde los mismos valores sin importar
que cliente consuma la API.
"""

from __future__ import annotations

import re
import unicodedata

PHONE_LENGTH = 10
PHONE_MESSAGE = "El telefono debe tener exactamente 10 digitos numericos (0-9), sin prefijos"
_PHONE_PATTERN = re.compile(r"[0-9]{10}")


def normalize_name(value: str) -> str:
    """Mayusculas con tildes y enie preservadas (NFC); sin espacios sobrantes ni repetidos."""
    return " ".join(unicodedata.normalize("NFC", value).upper().split())


def normalize_email(value: str) -> str:
    return unicodedata.normalize("NFC", value).strip().lower()


def normalize_username(value: str) -> str:
    """Nombre de usuario: siempre en minusculas y sin espacios en los extremos."""
    return unicodedata.normalize("NFC", value).strip().lower()


def validate_phone(value: str) -> str:
    """Exactamente 10 digitos ASCII; no se limpia nada: conserva ceros iniciales como texto."""
    if _PHONE_PATTERN.fullmatch(value) is None:
        raise ValueError(PHONE_MESSAGE)
    return value


_NAME_FIELDS = ("first_name", "middle_name", "last_name", "second_last_name")


def normalize_personal_data(target: object) -> None:
    """Normaliza in situ los campos presentes de un DTO o entidad (None = sin cambio).

    Los campos que `target` no declara (p. ej. `username` en el perfil) se omiten.
    """
    for name in _NAME_FIELDS:
        value = getattr(target, name, None)
        if value is not None:
            object.__setattr__(target, name, normalize_name(value))
    for name, normalizer in (("email", normalize_email), ("username", normalize_username)):
        value = getattr(target, name, None)
        if value is not None:
            object.__setattr__(target, name, normalizer(value))
