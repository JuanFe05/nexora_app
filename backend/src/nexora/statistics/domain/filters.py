"""Filtros validados compartidos por los informes de solo lectura."""

from dataclasses import dataclass
from datetime import date


class InvalidReportFilter(ValueError):
    """Los filtros solicitados para el informe no son válidos."""


@dataclass(frozen=True, slots=True)
class ReportFilter:
    fecha_inicial: date
    fecha_final: date
    sedes: tuple[int, ...]
    empresas: tuple[int, ...]
    lineas: tuple[int, ...] = ()

    def __post_init__(self) -> None:
        if self.fecha_inicial > self.fecha_final:
            raise InvalidReportFilter("La fecha inicial no puede ser posterior a la final.")
        object.__setattr__(self, "sedes", tuple(dict.fromkeys(self.sedes)))
        object.__setattr__(self, "empresas", tuple(dict.fromkeys(self.empresas)))
        object.__setattr__(self, "lineas", tuple(dict.fromkeys(self.lineas)))


# Compatibilidad con los consumidores del informe existente.
DetailedInvoicesFilter = ReportFilter
