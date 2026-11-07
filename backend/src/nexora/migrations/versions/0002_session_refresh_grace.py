"""Gracia acotada para refresh concurrente y reintentos tras respuesta perdida.

Sin el JTI anterior y la fecha de rotacion no se puede distinguir ese uso legitimo de
reutilizacion de un token mas antiguo. Solo se guardan UUID e instante, nunca JWT.
Las filas existentes conservan fecha_vencimiento: no se recalcula ni extiende su tope.

Revision ID: 0002_session_refresh_grace
Revises: 0001_iam_schema
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0002_session_refresh_grace"
down_revision: str | None = "0001_iam_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "iam"


def upgrade() -> None:
    op.add_column(
        "sesion", sa.Column("refresh_token_jti_anterior", UUID(as_uuid=True), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sesion", sa.Column("fecha_rotacion_refresh", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("sesion", "fecha_rotacion_refresh", schema=SCHEMA)
    op.drop_column("sesion", "refresh_token_jti_anterior", schema=SCHEMA)
