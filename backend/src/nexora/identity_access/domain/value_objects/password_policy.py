"""Politica unica para claves nuevas, incluido bootstrap y futuros restablecimientos.

Se cuentan code points Unicode sin recortar ni normalizar la entrada. Login y la
contrasena actual no usan esta politica, para conservar el acceso con claves legacy.
"""

from typing import Literal
from unicodedata import category

MIN = 6
MAX = 24

PasswordRule = Literal["length", "uppercase", "lowercase", "digit", "special"]


def password_policy_violations(password: str) -> tuple[PasswordRule, ...]:
    """Devuelve las reglas incumplidas en orden estable, sin efectos secundarios."""
    categories = {category(character) for character in password}
    checks: tuple[tuple[PasswordRule, bool], ...] = (
        ("length", MIN <= len(password) <= MAX),
        ("uppercase", "Lu" in categories),
        ("lowercase", "Ll" in categories),
        ("digit", "Nd" in categories),
        ("special", any(value.startswith(("P", "S")) for value in categories)),
    )
    return tuple(rule for rule, satisfied in checks if not satisfied)


def password_policy_message(violations: tuple[PasswordRule, ...]) -> str:
    """Mensaje ASCII compartido; solo nombra reglas, nunca incluye la clave."""
    descriptions = {
        "length": f"entre {MIN} y {MAX} caracteres",
        "uppercase": "al menos una letra mayuscula",
        "lowercase": "al menos una letra minuscula",
        "digit": "al menos un numero",
        "special": "al menos un caracter especial",
    }
    return "La contrasena debe cumplir: " + "; ".join(descriptions[rule] for rule in violations)


def validate_password_policy(password: str) -> None:
    """Rechaza una clave nueva con el mismo mensaje en todos los consumidores."""
    violations = password_policy_violations(password)
    if violations:
        raise ValueError(password_policy_message(violations))
