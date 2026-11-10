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
    """Mayusculas con tildes y enie preservadas (forma NFC)."""
    return unicodedata.normalize("NFC", value.strip()).upper()


def normalize_email(value: str) -> str:
    return value.strip().lower()


def validate_phone(value: str) -> str:
    """Exactamente 10 digitos ASCII; no se limpia nada: conserva ceros iniciales como texto."""
    if _PHONE_PATTERN.fullmatch(value) is None:
        raise ValueError(PHONE_MESSAGE)
    return value


_NAME_FIELDS = ("first_name", "middle_name", "last_name", "second_last_name")


def normalize_personal_data(target: object) -> None:
    """Normaliza in situ los campos presentes de un DTO inmutable (None = sin cambio)."""
    for name in _NAME_FIELDS:
        value = getattr(target, name)
        if value is not None:
            object.__setattr__(target, name, normalize_name(value))
    email = target.email
    if email is not None:
        object.__setattr__(target, "email", normalize_email(email))
