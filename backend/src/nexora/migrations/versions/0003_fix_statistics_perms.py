"""Corrige el catalogo de permisos de estadistica ya sembrado.

- Circulares: quita " (Medicamentos)" del nombre y la descripcion, solo cuando todavia tienen
  exactamente el texto sembrado antes (no pisa nombres editados por un administrador).
- Resoluciones: elimina el permiso inexistente ``res_1552_2013_256_2016`` junto con sus enlaces
  en ``rol_permiso``. Los permisos independientes ``res_1552_2013`` y ``res_256_2016`` los siembra
  la inicializacion idempotente; esta migracion no crea permisos ni toca otras asignaciones.

Es idempotente: sobre una base ya corregida o sin esas filas no cambia nada.
La baja es irreversible a proposito (la fila eliminada nunca tuvo endpoint ni vista).

Revision ID: 0003_fix_statistics_perms
Revises: 0002_session_refresh_grace
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_fix_statistics_perms"
down_revision: str | None = "0002_session_refresh_grace"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "iam"
OBSOLETE_CODE = "statistics.resolutions.res_1552_2013_256_2016.view"
RENAMED = {
    "statistics.circulars.circular_06_2018.view": (
        "Consultar Circular 06 de 2018 (Medicamentos)",
        "Consultar Circular 06 de 2018",
    ),
    "statistics.circulars.circular_21_2026.view": (
        "Consultar Circular 21 de 2026 (Medicamentos)",
        "Consultar Circular 21 de 2026",
    ),
}


_RENAME_NAME = sa.text(
    "UPDATE iam.permiso SET nombre = :new, fecha_actualizacion = now() "
    "WHERE codigo = :code AND nombre = :old"
)
_RENAME_DESCRIPTION = sa.text(
    "UPDATE iam.permiso SET descripcion = :new, fecha_actualizacion = now() "
    "WHERE codigo = :code AND descripcion = :old"
)
_UNLINK_OBSOLETE = sa.text(
    "DELETE FROM iam.rol_permiso WHERE permiso_id IN "
    "(SELECT id FROM iam.permiso WHERE codigo = :code)"
)
_DELETE_OBSOLETE = sa.text("DELETE FROM iam.permiso WHERE codigo = :code")


def upgrade() -> None:
    bind = op.get_bind()
    for code, (old, new) in RENAMED.items():
        params = {"code": code, "old": old, "new": new}
        bind.execute(_RENAME_NAME, params)
        bind.execute(_RENAME_DESCRIPTION, params)
    bind.execute(_UNLINK_OBSOLETE, {"code": OBSOLETE_CODE})
    bind.execute(_DELETE_OBSOLETE, {"code": OBSOLETE_CODE})


def downgrade() -> None:
    """Correccion de datos sin cambio de esquema: no hay nada que revertir."""
