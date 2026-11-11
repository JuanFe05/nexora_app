"""Contratos de la capacidad de integracion con fuentes externas (solo lectura).

Esta capa no conoce drivers ni configuracion. Los bounded contexts que consumen datos externos
declaran sus propias consultas nombradas (`ReadOnlyQuery`) y las ejecutan por este puerto: nunca
se acepta SQL proveniente de una peticion HTTP.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol


class ExternalSourceUnavailable(Exception):  # noqa: N818
    """La fuente externa no esta configurada o no se pudo contactar."""


class ExternalQueryFailed(Exception):  # noqa: N818
    """La fuente respondio con error al ejecutar la consulta (detalle solo en logs)."""


@dataclass(frozen=True, slots=True)
class ReadOnlyQuery:
    """Consulta de solo lectura con nombre, definida en codigo por el modulo propietario.

    `sql` usa parametros con nombre (`:fecha_inicial`). Los nombres en `list_params` se enlazan
    como listas (`IN (:sedes)`), expandidas en parametros enlazados, jamas concatenadas.
    """

    name: str
    sql: str
    list_params: frozenset[str] = field(default_factory=frozenset)


class SqlServerReader(Protocol):
    async def fetch_all(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None = None
    ) -> list[dict[str, Any]]: ...
