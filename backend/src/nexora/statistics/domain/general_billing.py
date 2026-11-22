"""Pure Facturación General rules from the three billing VBA modules in data_ips."""

from calendar import monthrange
from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any

SALE = "FACTURA ELECTRONICA DE VENTA"
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


def normalize_text(value: Any) -> str:
    return "" if value is None else " ".join(str(value).upper().split())


def parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    try:
        return date.fromisoformat(text)
    except ValueError:
        try:
            return datetime.fromisoformat(text).date()
        except ValueError:
            pass
    # SQL dates are usually native dates; tolerate the CSV format of the VBA input too.
    for pattern in ("%d/%m/%Y", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            pass
    return None


def _add_months(birth: date, months: int) -> date:
    year, month = divmod(birth.year * 12 + birth.month - 1 + months, 12)
    month += 1
    return date(year, month, min(birth.day, monthrange(year, month)[1]))


def _years(birth: date, reference: date) -> int:
    years = reference.year - birth.year
    return years - (_add_months(birth, years * 12) > reference)


def age_from_dates(birth: Any, reference: Any) -> tuple[int | None, str]:
    born, seen = parse_date(birth), parse_date(reference)
    if born is None or seen is None or born > seen:
        return None, ""
    days = (seen - born).days
    if days < 30:
        return days, "DÍAS"
    # Avoid creating year 10000 for otherwise valid dates at the date.max boundary.
    if seen.year == born.year or _years(born, seen) < 1:
        months = (seen.year - born.year) * 12 + seen.month - born.month
        months -= _add_months(born, months) > seen
        return max(1, months), "MESES"
    return _years(born, seen), "AÑOS"


def course_of_life(birth: Any, reference: Any) -> str:
    born, seen = parse_date(birth), parse_date(reference)
    if born is None or seen is None or born > seen:
        return ""
    years = _years(born, seen)
    if years == 0 and (seen - born).days <= 6:
        return "RECIEN NACIDO"
    for maximum, label in (
        (5, "PRIMERA INFANCIA"),
        (11, "INFANCIA"),
        (17, "ADOLESCENCIA"),
        (28, "JUVENTUD"),
        (59, "ADULTEZ"),
    ):
        if years <= maximum:
            return label
    return "VEJEZ"


def month_name(value: Any) -> str:
    parsed = parse_date(value)
    return MONTHS[parsed.month - 1] if parsed else ""


def row_matches(row: Mapping[str, Any]) -> bool:
    if normalize_text(row.get("estado")) != "CERRADO":
        return False
    transaction = normalize_text(row.get("dscrp_transcn"))
    return transaction in {SALE, "FACTURA AGRUPADA"} or (
        transaction == "TRANSACCION" and normalize_text(row.get("emprs")) in PGP_COMPANIES
    )


def _decimal(value: Any) -> Decimal | None:
    try:
        parsed = Decimal(str(value).strip().replace(",", "."))
        return parsed if parsed.is_finite() else None
    except InvalidOperation, ValueError, TypeError:
        return None


def money(value: Any) -> int | Decimal:
    parsed = _decimal(value)
    if parsed is None:
        return 0
    return int(parsed) if parsed == parsed.to_integral_value() else parsed


def add_money(left: int | Decimal, right: int | Decimal) -> int | Decimal:
    """Exact sum even for SQL DECIMAL(38, ...) beyond the default 28-digit context."""
    a, b = Decimal(left), Decimal(right)
    with localcontext() as context:
        context.prec = (
            max(a.adjusted(), b.adjusted())
            - min(int(a.as_tuple().exponent), int(b.as_tuple().exponent))
            + 2
        )
        return money(a + b)


def payments(row: Mapping[str, Any]) -> tuple[int | Decimal, int | Decimal, int | Decimal]:
    particular = normalize_text(row.get("emprs")) == "PARTICULAR"
    second = row.get("vlr_frmas_pgo_tpo2")
    empty_or_zero = not normalize_text(second) or _decimal(second) == 0
    copago: int | Decimal = 0
    if (
        not particular
        and normalize_text(row.get("tpo_lqdcn_pcnte")) in COPAGO_KINDS
        and empty_or_zero
    ):
        copago = money(row.get("vlr_lqdd_pcnte"))
    if particular and normalize_text(row.get("dscrp_transcn")) == SALE:
        return 0, money(row.get("vlr_frmas_pgo_tpo1")), money(second)
    return copago, 0, 0


def invoice_key(row: Mapping[str, Any]) -> tuple[str, str, str]:
    return (
        normalize_text(row.get("prfjo_dcto")),
        normalize_text(row.get("dscrp_transcn")),
        normalize_text(row.get("cnsctvo_dcto")),
    )
