"""Modelos de persistencia del esquema `iam`.

Los nombres de tablas y columnas respetan el MER aprobado (espanol); los atributos Python
mantienen la convencion en ingles mediante el primer argumento de `mapped_column`.
Estas clases son detalle de infraestructura: el dominio no las conoce.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from nexora.shared_kernel.persistence import Base

IAM_SCHEMA = "iam"


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(PGUUID(as_uuid=True), primary_key=True)


class UserModel(Base):
    __tablename__ = "usuario"
    __table_args__ = (
        CheckConstraint("estado IN ('activo', 'inactivo')", name="estado_valido"),
        {"schema": IAM_SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    first_name: Mapped[str] = mapped_column("primer_nombre", String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column("segundo_nombre", String(100))
    last_name: Mapped[str] = mapped_column("primer_apellido", String(100), nullable=False)
    second_last_name: Mapped[str | None] = mapped_column("segundo_apellido", String(100))
    username: Mapped[str] = mapped_column("nombre_usuario", String(50), nullable=False, unique=True)
    email: Mapped[str] = mapped_column("correo", String(255), nullable=False, unique=True)
    phone_number: Mapped[str | None] = mapped_column("numero_telefono", String(30))
    password_hash: Mapped[str] = mapped_column("hash_contrasena", String(255), nullable=False)
    status: Mapped[str] = mapped_column("estado", String(20), nullable=False, default="activo")
    password_changed_at: Mapped[datetime | None] = mapped_column(
        "fecha_cambio_contrasena", DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "fecha_actualizacion",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class RoleModel(Base):
    __tablename__ = "rol"
    __table_args__ = (
        CheckConstraint("estado IN ('activo', 'inactivo')", name="estado_valido"),
        {"schema": IAM_SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    code: Mapped[str] = mapped_column("codigo", String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column("nombre", String(100), nullable=False)
    description: Mapped[str | None] = mapped_column("descripcion", String(255))
    status: Mapped[str] = mapped_column("estado", String(20), nullable=False, default="activo")
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "fecha_actualizacion",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PermissionModel(Base):
    __tablename__ = "permiso"
    __table_args__ = ({"schema": IAM_SCHEMA},)

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    code: Mapped[str] = mapped_column("codigo", String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column("nombre", String(100), nullable=False)
    description: Mapped[str | None] = mapped_column("descripcion", String(255))
    module: Mapped[str] = mapped_column("modulo", String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "fecha_actualizacion",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class RolePermissionModel(Base):
    """Tabla puente rol <-> permiso. PK compuesta, sin identificador artificial."""

    __tablename__ = "rol_permiso"
    __table_args__ = ({"schema": IAM_SCHEMA},)

    role_id: Mapped[uuid.UUID] = mapped_column(
        "rol_id",
        PGUUID(as_uuid=True),
        ForeignKey(f"{IAM_SCHEMA}.rol.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        "permiso_id",
        PGUUID(as_uuid=True),
        ForeignKey(f"{IAM_SCHEMA}.permiso.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RoleAssignmentModel(Base):
    """Asignacion de rol a usuario. `asignado_por` es nulo solo en siembras del sistema."""

    __tablename__ = "asignacion_rol"
    __table_args__ = (
        Index("ix_asignacion_rol_rol_id", "rol_id"),
        {"schema": IAM_SCHEMA},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        "usuario_id",
        PGUUID(as_uuid=True),
        ForeignKey(f"{IAM_SCHEMA}.usuario.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        "rol_id",
        PGUUID(as_uuid=True),
        ForeignKey(f"{IAM_SCHEMA}.rol.id", ondelete="CASCADE"),
        primary_key=True,
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        "asignado_por",
        PGUUID(as_uuid=True),
        ForeignKey(f"{IAM_SCHEMA}.usuario.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SessionModel(Base):
    """Sesion autenticada. Solo se guarda el JTI del refresh token, nunca el JWT completo."""

    __tablename__ = "sesion"
    __table_args__ = (
        Index("ix_sesion_usuario_id", "usuario_id"),
        {"schema": IAM_SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        "usuario_id",
        PGUUID(as_uuid=True),
        ForeignKey(f"{IAM_SCHEMA}.usuario.id", ondelete="CASCADE"),
        nullable=False,
    )
    refresh_token_jti: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, unique=True
    )
    previous_refresh_token_jti: Mapped[uuid.UUID | None] = mapped_column(
        "refresh_token_jti_anterior", PGUUID(as_uuid=True)
    )
    refresh_rotated_at: Mapped[datetime | None] = mapped_column(
        "fecha_rotacion_refresh", DateTime(timezone=True)
    )
    ip_address: Mapped[str | None] = mapped_column("direccion_ip", INET)
    user_agent: Mapped[str | None] = mapped_column("agente_usuario", String(255))
    created_at: Mapped[datetime] = mapped_column(
        "fecha_creacion", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_activity_at: Mapped[datetime] = mapped_column(
        "fecha_ultima_actividad", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        "fecha_vencimiento", DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column("fecha_revocacion", DateTime(timezone=True))
