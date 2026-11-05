"""Argon2id (S15/seccion 15)."""

from __future__ import annotations

from nexora.identity_access.infrastructure.security.password_hasher import Argon2PasswordHasher

PASSWORD = "Secreta123*"


def test_el_hash_es_argon2id_y_nunca_guarda_la_contrasena() -> None:
    hasher = Argon2PasswordHasher()

    password_hash = hasher.hash(PASSWORD)

    assert password_hash.startswith("$argon2id$")
    assert PASSWORD not in password_hash


def test_verifica_la_contrasena_correcta_y_rechaza_la_incorrecta() -> None:
    hasher = Argon2PasswordHasher()
    password_hash = hasher.hash(PASSWORD)

    assert hasher.verify(password_hash, PASSWORD) is True
    assert hasher.verify(password_hash, "otra-cosa") is False


def test_un_hash_corrupto_no_explota() -> None:
    hasher = Argon2PasswordHasher()

    assert hasher.verify("no-es-un-hash", PASSWORD) is False


def test_dummy_verify_no_lanza_excepcion() -> None:
    Argon2PasswordHasher().dummy_verify()
