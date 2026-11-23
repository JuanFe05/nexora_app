"""Reglas puras de importes y fechas del CSV Ser Laboral (no de SQL Server)."""

import re
from datetime import date
from decimal import Decimal, localcontext

from nexora.statistics.domain.general_billing import Money, money

_DOCUMENT_DATE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")
_PATIENT_DATE = re.compile(
    r"(\d{1,2})/(\d{1,2})/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)",
    re.IGNORECASE,
)


def csv_money(value: str) -> Money:
    """Coma de miles, punto decimal; vacíos/no numéricos cuentan como cero."""
    return money(value.replace(",", ""))


def line_total(quantity: Money, unit_price: Money) -> Money:
    """Producto Decimal exacto, sin el redondeo del contexto global."""
    a, b = Decimal(quantity), Decimal(unit_price)
    with localcontext() as context:
        context.prec = len(a.as_tuple().digits) + len(b.as_tuple().digits)
        return money(a * b)


def document_date(value: str) -> str:
    """Día/mes/año a ISO, sin heurísticas que intercambien día y mes."""
    match = _DOCUMENT_DATE.fullmatch(value.strip())
    if match is None:
        return ""
    day, month, year = map(int, match.groups())
    return _iso(year, month, day)


def patient_date(value: str) -> str:
    """Mes/día/año con hora de 12 horas; no depende del locale del servidor."""
    match = _PATIENT_DATE.fullmatch(value.strip())
    if match is None:
        return ""
    month, day, year, hour, minute, second = map(int, match.groups()[:6])
    if not (1 <= hour <= 12 and 0 <= minute < 60 and 0 <= second < 60):
        return ""
    return _iso(year, month, day)


def _iso(year: int, month: int, day: int) -> str:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return ""
