"""Hashing de contrasenas con Argon2id."""

from __future__ import annotations

from argon2 import PasswordHasher as Argon2Hasher
from argon2 import Type
from argon2.exceptions import Argon2Error, InvalidHashError, VerificationError

#: Hash senuelo con los mismos parametros, usado cuando el usuario no existe.
_DUMMY_PASSWORD = "nexora-dummy-password"  # noqa: S105  (no es una credencial real)


class Argon2PasswordHasher:
    def __init__(self) -> None:
        self._hasher = Argon2Hasher(type=Type.ID)
        self._dummy_hash = self._hasher.hash(_DUMMY_PASSWORD)

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except VerificationError, InvalidHashError, Argon2Error:
            return False

    def dummy_verify(self) -> None:
        try:
            self._hasher.verify(self._dummy_hash, "")
        except VerificationError, InvalidHashError, Argon2Error:
            return
