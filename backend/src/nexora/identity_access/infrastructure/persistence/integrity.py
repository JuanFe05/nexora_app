"""Traduccion acotada de restricciones de identidad de PostgreSQL."""

from collections.abc import Iterator
from contextlib import contextmanager

from psycopg.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from nexora.identity_access.domain.exceptions.identity import ConflictError

_IDENTITY_CONSTRAINTS = frozenset({"uq_usuario_nombre_usuario", "uq_usuario_correo"})


@contextmanager
def identity_conflicts() -> Iterator[None]:
    """No confundir otras restricciones ni errores de persistencia con duplicados."""
    try:
        yield
    except IntegrityError as error:
        original = error.orig
        if (
            isinstance(original, UniqueViolation)
            and original.diag.schema_name == "iam"
            and original.diag.table_name == "usuario"
            and original.diag.constraint_name in _IDENTITY_CONSTRAINTS
        ):
            raise ConflictError("El nombre de usuario o el correo ya estan registrados") from error
        raise
