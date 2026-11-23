"""Reglas puras de Facturación General, sin dependencias de framework.

Los datos llegan tipados desde la consulta de SQL Server (fechas nativas o ISO, importes
numéricos o decimales con punto).
"""

from calendar import monthrange
from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any

SALE = "FACTURA ELECTRONICA DE VENTA"
GROUPED = "FACTURA AGRUPADA"
TRANSACTION = "TRANSACCION"
PGP_COMPANIES = {"SOS PGP MIR Y COR CONTRIBUTIVO", "SOS PGP MIR Y COR SUBSIDIADO"}
COPAGO_KINDS = {"COPAGO", "COPAGO Y CUOTA MODERADORA", "CUOTA MODERADORA", "SIN CLASIFICAR"}
MONTHS = (
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
)
# (años máximos inclusive, grupo etario); el resto es VEJEZ.
LIFE_COURSES = (
    (5, "PRIMERA INFANCIA"),
    (11, "INFANCIA"),
    (17, "ADOLESCENCIA"),
    (28, "JUVENTUD"),
    (59, "ADULTEZ"),
)
MAX_DAYS_AS_DAYS = 30
NEWBORN_MAX_DAYS = 6

Money = int | Decimal


def normalize_text(value: Any) -> str:
    """Texto en mayúsculas, sin espacios sobrantes; nulo se convierte en cadena vacía."""
    return "" if value is None else " ".join(str(value).upper().split())


def parse_date(value: Any) -> date | None:
    """Fecha nativa de SQL Server o texto ISO (`AAAA-MM-DD`, con hora opcional); si no, None."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value or "").strip()).date()
    except ValueError:
        return None


def _add_months(start: date, months: int) -> date:
    """Suma meses calendario ajustando al último día del mes (como `DateAdd` de VBA)."""
    year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
    month += 1
    return date(year, month, min(start.day, monthrange(year, month)[1]))


def _years(birth: date, reference: date) -> int:
    years = reference.year - birth.year
    return years - (_add_months(birth, years * 12) > reference)


def age_from_dates(birth: Any, reference: Any) -> tuple[int | None, str]:
    """Edad y unidad (DÍAS, MESES o AÑOS) en la fecha de referencia.

    Menos de 30 días se reportan en días; antes del primer año, en meses completos (mínimo 1);
    después, en años completos. Fechas inválidas o nacimiento posterior devuelven `(None, "")`.
    """
    born, seen = parse_date(birth), parse_date(reference)
    if born is None or seen is None or born > seen:
        return None, ""
    days = (seen - born).days
    if days < MAX_DAYS_AS_DAYS:
        return days, "DÍAS"
    # Evita construir un año 10000 con fechas válidas en el límite de `date.max`.
    if seen.year == born.year or _years(born, seen) < 1:
        months = (seen.year - born.year) * 12 + seen.month - born.month
        months -= _add_months(born, months) > seen
        return max(1, months), "MESES"
    return _years(born, seen), "AÑOS"


def course_of_life(birth: Any, reference: Any) -> str:
    """Grupo etario según los años completos; vacío con fechas inválidas."""
    born, seen = parse_date(birth), parse_date(reference)
    if born is None or seen is None or born > seen:
        return ""
    years = _years(born, seen)
    if years == 0 and (seen - born).days <= NEWBORN_MAX_DAYS:
        return "RECIEN NACIDO"
    for maximum, group in LIFE_COURSES:
        if years <= maximum:
            return group
    return "VEJEZ"


def month_name(value: Any) -> str:
    parsed = parse_date(value)
    return MONTHS[parsed.month - 1] if parsed else ""


def row_matches(row: Mapping[str, Any]) -> bool:
    """Documentos cerrados: facturas de venta o agrupadas y, de las transacciones, solo las PGP."""
    if normalize_text(row.get("estado")) != "CERRADO":
        return False
    transaction = normalize_text(row.get("dscrp_transcn"))
    return transaction in {SALE, GROUPED} or (
        transaction == TRANSACTION and normalize_text(row.get("emprs")) in PGP_COMPANIES
    )


def _decimal(value: Any) -> Decimal | None:
    """Decimal exacto de un número o de un texto con punto decimal; None si no es numérico."""
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    except InvalidOperation, ValueError:
        return None
    return number if number.is_finite() else None


def money(value: Any) -> Money:
    """Importe exacto: entero si no tiene decimales; nulo o inválido cuenta como 0."""
    number = _decimal(value)
    if number is None:
        return 0
    return int(number) if number == number.to_integral_value() else number


def add_money(left: Money, right: Money) -> Money:
    """Suma exacta, incluso con DECIMAL(38, …) de SQL Server (más de 28 dígitos)."""
    a, b = Decimal(left), Decimal(right)
    with localcontext() as context:
        context.prec = (
            max(a.adjusted(), b.adjusted())
            - min(int(a.as_tuple().exponent), int(b.as_tuple().exponent))
            + 2
        )
        return money(a + b)


def payments(row: Mapping[str, Any]) -> tuple[Money, Money, Money]:
    """(copago, pago particular, descuento) que lleva la primera fila de una factura.

    - Empresa distinta de PARTICULAR con liquidación de copago o cuota moderadora y sin
      descuento (tipo 2): el copago es el valor liquidado al paciente.
    - PARTICULAR con factura electrónica de venta: pago particular (tipo 1) y descuento (tipo 2).
    """
    private = normalize_text(row.get("emprs")) == "PARTICULAR"
    discount = row.get("vlr_frmas_pgo_tpo2")
    no_discount = not normalize_text(discount) or _decimal(discount) == 0
    if private and normalize_text(row.get("dscrp_transcn")) == SALE:
        return 0, money(row.get("vlr_frmas_pgo_tpo1")), money(discount)
    if not private and normalize_text(row.get("tpo_lqdcn_pcnte")) in COPAGO_KINDS and no_discount:
        return money(row.get("vlr_lqdd_pcnte")), 0, 0
    return 0, 0, 0


def invoice_key(row: Mapping[str, Any]) -> tuple[str, str, str]:
    """Identifica una factura por prefijo, tipo de documento y consecutivo."""
    return (
        normalize_text(row.get("prfjo_dcto")),
        normalize_text(row.get("dscrp_transcn")),
        normalize_text(row.get("cnsctvo_dcto")),
    )
