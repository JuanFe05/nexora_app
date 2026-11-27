"""Persiste el cambio de contrasena obligatorio tras un reset administrativo.

Revision ID: 0006_required_password_change
Revises: 0005_moderator_fees_limit
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_required_password_change"
down_revision: str | None = "0005_moderator_fees_limit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "usuario",
        sa.Column(
            "requiere_cambio_contrasena", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        schema="iam",
    )


def downgrade() -> None:
    # Un downgrade debe fallar antes que permitir acceso normal con una clave temporal.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM iam.usuario WHERE requiere_cambio_contrasena) THEN
                RAISE EXCEPTION 'Hay cambios de contrasena obligatorios pendientes';
            END IF;
        END;
        $$;
        """
    )
    op.drop_column("usuario", "requiere_cambio_contrasena", schema="iam")
