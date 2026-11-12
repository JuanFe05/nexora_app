"""Definición de columnas de exportación, independiente del formato y del transporte."""

from dataclasses import dataclass
from typing import Literal

ColumnType = Literal["text", "number", "date"]


@dataclass(frozen=True, slots=True)
class ExportColumn:
    """`id` es el alias original de SQL Server y se escribe tal cual como encabezado."""

    id: str
    type: ColumnType
