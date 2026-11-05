"""Esquema inicial de identity_access (iam) y catalogo de permisos.

Revision ID: 0001_iam_schema
Revises:
Create Date: 2026-11-05
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import INET, UUID

revision: str = "0001_iam_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "iam"

#: Catalogo controlado por el backend. El cliente nunca define codigos de permiso.
PERMISSIONS: tuple[tuple[str, str, str], ...] = (
    ("identity.users.view", "Consultar usuarios", "identity"),
    ("identity.users.create", "Crear usuarios", "identity"),
    ("identity.users.update", "Actualizar usuarios", "identity"),
    ("identity.users.deactivate", "Desactivar usuarios", "identity"),
    ("identity.users.reset_password", "Supervisar restablecimiento de contrasena", "identity"),
    ("identity.roles.view", "Consultar roles", "identity"),
    ("identity.roles.create", "Crear roles", "identity"),
    ("identity.roles.update", "Actualizar roles", "identity"),
    ("identity.roles.assign_permissions", "Asignar permisos a roles", "identity"),
)


def upgrade() -> None:
    op.execute(sa.text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))

    op.create_table(
        "usuario",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("primer_nombre", sa.String(length=100), nullable=False),
        sa.Column("segundo_nombre", sa.String(length=100), nullable=True),
        sa.Column("primer_apellido", sa.String(length=100), nullable=False),
        sa.Column("segundo_apellido", sa.String(length=100), nullable=True),
        sa.Column("nombre_usuario", sa.String(length=50), nullable=False),
        sa.Column("correo", sa.String(length=255), nullable=False),
        sa.Column("numero_telefono", sa.String(length=30), nullable=True),
        sa.Column("hash_contrasena", sa.String(length=255), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="activo"),
        sa.Column("fecha_cambio_contrasena", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "fecha_actualizacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("estado IN ('activo', 'inactivo')", name="ck_usuario_estado_valido"),
        sa.PrimaryKeyConstraint("id", name="pk_usuario"),
        sa.UniqueConstraint("nombre_usuario", name="uq_usuario_nombre_usuario"),
        sa.UniqueConstraint("correo", name="uq_usuario_correo"),
        schema=SCHEMA,
    )

    op.create_table(
        "rol",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("codigo", sa.String(length=50), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="activo"),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "fecha_actualizacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("estado IN ('activo', 'inactivo')", name="ck_rol_estado_valido"),
        sa.PrimaryKeyConstraint("id", name="pk_rol"),
        sa.UniqueConstraint("codigo", name="uq_rol_codigo"),
        schema=SCHEMA,
    )

    op.create_table(
        "permiso",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("codigo", sa.String(length=100), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=True),
        sa.Column("modulo", sa.String(length=50), nullable=False),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "fecha_actualizacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_permiso"),
        sa.UniqueConstraint("codigo", name="uq_permiso_codigo"),
        schema=SCHEMA,
    )

    op.create_table(
        "rol_permiso",
        sa.Column("rol_id", UUID(as_uuid=True), nullable=False),
        sa.Column("permiso_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["rol_id"], [f"{SCHEMA}.rol.id"], name="fk_rol_permiso_rol_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["permiso_id"],
            [f"{SCHEMA}.permiso.id"],
            name="fk_rol_permiso_permiso_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("rol_id", "permiso_id", name="pk_rol_permiso"),
        schema=SCHEMA,
    )
    op.create_index("ix_rol_permiso_permiso_id", "rol_permiso", ["permiso_id"], schema=SCHEMA)

    op.create_table(
        "asignacion_rol",
        sa.Column("usuario_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rol_id", UUID(as_uuid=True), nullable=False),
        sa.Column("asignado_por", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            [f"{SCHEMA}.usuario.id"],
            name="fk_asignacion_rol_usuario_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["rol_id"], [f"{SCHEMA}.rol.id"], name="fk_asignacion_rol_rol_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["asignado_por"],
            [f"{SCHEMA}.usuario.id"],
            name="fk_asignacion_rol_asignado_por",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("usuario_id", "rol_id", name="pk_asignacion_rol"),
        schema=SCHEMA,
    )
    op.create_index("ix_asignacion_rol_rol_id", "asignacion_rol", ["rol_id"], schema=SCHEMA)

    op.create_table(
        "sesion",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("usuario_id", UUID(as_uuid=True), nullable=False),
        sa.Column("refresh_token_jti", UUID(as_uuid=True), nullable=False),
        sa.Column("direccion_ip", INET(), nullable=True),
        sa.Column("agente_usuario", sa.String(length=255), nullable=True),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "fecha_ultima_actividad",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("fecha_vencimiento", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fecha_revocacion", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            [f"{SCHEMA}.usuario.id"],
            name="fk_sesion_usuario_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sesion"),
        sa.UniqueConstraint("refresh_token_jti", name="uq_sesion_refresh_token_jti"),
        schema=SCHEMA,
    )
    op.create_index("ix_sesion_usuario_id", "sesion", ["usuario_id"], schema=SCHEMA)

    permiso = sa.table(
        "permiso",
        sa.column("id", UUID(as_uuid=True)),
        sa.column("codigo", sa.String),
        sa.column("nombre", sa.String),
        sa.column("modulo", sa.String),
        schema=SCHEMA,
    )
    op.bulk_insert(
        permiso,
        [
            {"id": uuid.uuid4(), "codigo": code, "nombre": name, "modulo": module}
            for code, name, module in PERMISSIONS
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_sesion_usuario_id", table_name="sesion", schema=SCHEMA)
    op.drop_table("sesion", schema=SCHEMA)
    op.drop_index("ix_asignacion_rol_rol_id", table_name="asignacion_rol", schema=SCHEMA)
    op.drop_table("asignacion_rol", schema=SCHEMA)
    op.drop_index("ix_rol_permiso_permiso_id", table_name="rol_permiso", schema=SCHEMA)
    op.drop_table("rol_permiso", schema=SCHEMA)
    op.drop_table("permiso", schema=SCHEMA)
    op.drop_table("rol", schema=SCHEMA)
    op.drop_table("usuario", schema=SCHEMA)
    op.execute(sa.text(f"DROP SCHEMA IF EXISTS {SCHEMA}"))
