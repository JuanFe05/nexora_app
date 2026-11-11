"""Validated filters for the detailed invoices report."""

from dataclasses import dataclass
from datetime import date


class InvalidReportFilter(ValueError):
    """The requested report filters are not valid."""


@dataclass(frozen=True, slots=True)
class DetailedInvoicesFilter:
    fecha_inicial: date
    fecha_final: date
    sedes: tuple[int, ...]
    empresas: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.fecha_inicial > self.fecha_final:
            raise InvalidReportFilter("La fecha inicial no puede ser posterior a la final.")
        object.__setattr__(self, "sedes", tuple(dict.fromkeys(self.sedes)))
        object.__setattr__(self, "empresas", tuple(dict.fromkeys(self.empresas)))
