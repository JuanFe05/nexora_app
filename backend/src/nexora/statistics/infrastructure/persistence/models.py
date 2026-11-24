"""Configuración administrativa; no contiene datos clínicos."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from nexora.shared_kernel.persistence import Base


class ModeratorFeeModel(Base):
    __tablename__ = "cuota_moderadora"
    __table_args__ = (
        CheckConstraint("vigencia BETWEEN 2000 AND 2100", name="vigencia_valida"),
        CheckConstraint(
            "array_ndims(importes) = 1 AND cardinality(importes) BETWEEN 1 AND 10 "
            "AND array_position(importes, NULL) IS NULL "
            "AND 1 <= ALL(importes) AND 1000000 >= ALL(importes)",
            name="importes_validos",
        ),
        CheckConstraint("statistics.importes_unicos(importes)", name="importes_unicos"),
        {"schema": "statistics"},
    )

    year: Mapped[int] = mapped_column("vigencia", Integer, primary_key=True)
    amounts: Mapped[list[int]] = mapped_column("importes", ARRAY(Integer), nullable=False)
    updated_by: Mapped[UUID | None] = mapped_column(
        "actualizado_por", ForeignKey("iam.usuario.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(
        "actualizado_en", DateTime(timezone=True), nullable=False, server_default=func.now()
    )
