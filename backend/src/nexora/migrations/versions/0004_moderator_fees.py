"""Cuotas moderadoras persistidas por vigencia.

Revision ID: 0004_moderator_fees
Revises: 0003_fix_statistics_perms
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_moderator_fees"
down_revision: str | None = "0003_fix_statistics_perms"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA statistics")
    op.execute(
        "CREATE FUNCTION statistics.importes_unicos(integer[]) RETURNS boolean "
        "LANGUAGE SQL IMMUTABLE STRICT AS $$ "
        "SELECT cardinality($1) = (SELECT count(DISTINCT value) FROM unnest($1) AS value) $$"
    )
    table = op.create_table(
        "cuota_moderadora",
        sa.Column("vigencia", sa.Integer(), nullable=False),
        sa.Column("importes", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("actualizado_por", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("vigencia", name=op.f("pk_cuota_moderadora")),
        sa.ForeignKeyConstraint(
            ["actualizado_por"], ["iam.usuario.id"], ondelete="SET NULL",
            name=op.f("fk_cuota_moderadora_actualizado_por"),
        ),
        sa.CheckConstraint("vigencia BETWEEN 2000 AND 2100", name=op.f(
            "ck_cuota_moderadora_vigencia_valida")),
        sa.CheckConstraint(
            "array_ndims(importes) = 1 AND cardinality(importes) BETWEEN 1 AND 10 "
            "AND array_position(importes, NULL) IS NULL "
            "AND 1 <= ALL(importes) AND 10000000 >= ALL(importes)",
            name=op.f("ck_cuota_moderadora_importes_validos"),
        ),
        sa.CheckConstraint("statistics.importes_unicos(importes)",
                           name=op.f("ck_cuota_moderadora_importes_unicos")),
        schema="statistics",
    )
    # Literales propios de la migración: no dependen de configuración ni del catálogo vivo.
    op.bulk_insert(table, [{"vigencia": 2026, "importes": [5000, 20100, 52800]}])


def downgrade() -> None:
    op.drop_table("cuota_moderadora", schema="statistics")
    op.execute("DROP FUNCTION statistics.importes_unicos(integer[])")
    op.execute("DROP SCHEMA statistics")
