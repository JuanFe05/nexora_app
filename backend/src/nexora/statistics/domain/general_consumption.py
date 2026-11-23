"""Reglas de Consumo General; solo Facturas Detalladas alimenta el análisis."""

from collections.abc import Mapping
from typing import Any

from nexora.statistics.domain.general_billing import normalize_text


class UnconfiguredFeeYear(ValueError):
    """No se puede clasificar un importe usando una vigencia inventada."""

    def __init__(self, year: int) -> None:
        super().__init__(f"No hay cuotas moderadoras configuradas para la vigencia {year}.")


def fila_cumple(row: Mapping[str, Any]) -> bool:
    """Predicado exclusivo de Consumo, sobre los alias reales de Facturas Detalladas."""
    if normalize_text(row.get("estado")) != "CERRADO":
        return False
    if normalize_text(row.get("cdgo_prcdmnto")) in {"2", "3"}:
        return False
    if normalize_text(row.get("dscrp_transcn")) == "FACTURA AGRUPADA":
        return False
    if normalize_text(row.get("pnto_atncn")) == "URGENCIAS":
        return normalize_text(row.get("emprs")) in {"PARTICULAR", "PARTICULAR FISIO NATURA"}
    return normalize_text(row.get("admision")) in {"", "0"}
