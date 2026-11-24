"""Reduce el máximo por importe a un millón COP sin modificar datos existentes.

Revision ID: 0005_moderator_fees_limit
Revises: 0004_moderator_fees
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005_moderator_fees_limit"
down_revision: str | None = "0004_moderator_fees"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _replace_amount_constraint(maximum: int) -> None:
    op.drop_constraint(
        op.f("ck_cuota_moderadora_importes_validos"),
        "cuota_moderadora", schema="statistics", type_="check",
    )
    op.create_check_constraint(
        op.f("ck_cuota_moderadora_importes_validos"), "cuota_moderadora",
        "array_ndims(importes) = 1 AND cardinality(importes) BETWEEN 1 AND 10 "
        "AND array_position(importes, NULL) IS NULL "
        f"AND 1 <= ALL(importes) AND {maximum} >= ALL(importes)",
        schema="statistics",
    )


def upgrade() -> None:
    # PostgreSQL validates existing rows; incompatible amounts must be resolved before deployment.
    _replace_amount_constraint(1_000_000)


def downgrade() -> None:
    _replace_amount_constraint(10_000_000)
