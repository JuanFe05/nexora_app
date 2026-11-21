"""Reglas epidemiológicas de la Notificación SIVIGILA, sin dependencias de framework.

Las listas de diagnósticos y los rangos de edad reproducen exactamente `Grupos_DX.bas` y
`Grupos_Edades.bas` (data_ips). No se amplían ni se sustituyen por prefijos.
"""

import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

EVENT_IRA = "ira"
EVENT_EDA = "eda"
EVENT_DENGUE = "dengue"
EVENT_VARICELA = "varicela"
EVENT_RABIA = "rabia"
EVENTS = (EVENT_IRA, EVENT_EDA, EVENT_DENGUE, EVENT_VARICELA, EVENT_RABIA)


def _codes(*groups: str) -> frozenset[str]:
    """Une los fragmentos de texto y devuelve el conjunto exacto de códigos listados."""
    return frozenset(" ".join(groups).split())


# IRA: infección respiratoria aguda
IRA_CODES = _codes(
    "J00X "
    "J010 J011 J012 J013 J014 J018 J019 "
    "J020 J029 "
    "J030 J038 J039 "
    "J040 J041 J042 "
    "J050 J051 "
    "J060 J068 J069 "
    "J100 J101 J108 "
    "J110 J111 J118 "
    "J120 J121 J122 J128 J129 "
    "J13X "
    "J14X "
    "J150 J151 J152 J153 J154 J155 J156 J157 J158 J159 "
    "J160 J168 "
    "J170 J171 J172 J173 J178 "
    "J180 J181 J182 J188 J189 "
    "J200 J201 J202 J203 J204 J205 J206 J207 J208 J209 "
    "J210 J211 J218 J219 "
    "J22X"
)

# EDA: enfermedad diarreica aguda
EDA_CODES = _codes(
    "A020 A029 "
    "A030 A031 A032 A033 A038 A039 "
    "A040 A041 A042 A043 A044 A045 A046 A047 A048 A049 "
    "A050 A052 A053 A054 A058 A059 "
    "A060 A069 "
    "A070 A071 A072 A073 A078 A079 "
    "A080 A081 A082 A083 A084 A085 "
    "A09X A090 A099"
)

# Dengue y códigos asociados
DENGUE_CODES = _codes("A90X A91X D694 D695 D696 D473 A970 A971 A972 A979")

# Varicela
VARICELA_CODES = _codes("B010 B011 B012 B018 B019")

# Exposición rábica
RABIA_CODES = _codes(
    "A259 "
    "A820 A821 A829 "
    "W500 W501 W502 W503 W504 W505 W506 W507 W508 W509 "
    "W530 W531 W532 W533 W534 W535 W536 W537 W538 W539 "
    "W540 W541 W542 W543 W544 W545 W546 W547 W548 W549 "
    "W550 W551 W552 W553 W554 W555 W556 W557 W558 W559 "
    "W580 W581 W582 W583 W584 W585 W586 W587 W588 W589 "
    "W590 W591 W592 W593 W594 W595 W596 W597 W598 W599 "
    "Z203 "
    "Z242"
)


EVENT_CODES: dict[str, frozenset[str]] = {
    EVENT_IRA: IRA_CODES,
    EVENT_EDA: EDA_CODES,
    EVENT_DENGUE: DENGUE_CODES,
    EVENT_VARICELA: VARICELA_CODES,
    EVENT_RABIA: RABIA_CODES,
}


def normalize_code(value: Any) -> str:
    """Quita espacios y pasa a mayúsculas, como `UCase(Trim(CStr(...)))` del VBA."""
    return "" if value is None else str(value).strip().upper()


def events_for_codes(codes: Iterable[Any]) -> frozenset[str]:
    """Eventos a los que pertenece al menos uno de los diagnósticos, evaluados por separado."""
    normalized = {normalize_code(code) for code in codes}
    return frozenset(event for event, listed in EVENT_CODES.items() if normalized & listed)


@dataclass(frozen=True, slots=True)
class AgeGroup:
    label: str  # nombre del grupo (Grupos_Edades.bas)
    header: str  # encabezado en las tablas de Análisis
    minimum: int  # años cumplidos, inclusive


IRA_AGE_GROUPS = (
    AgeGroup("Menor de 1 Año", "< 1 Año", 0),
    AgeGroup("1 Año", "1 Año", 1),
    AgeGroup("De 2 a 4 Años", "2 a 4 Años", 2),
    AgeGroup("De 5 a 19 Años", "5 a 19 Años", 5),
    AgeGroup("De 20 a 39 Años", "20 a 39 Años", 20),
    AgeGroup("De 40 a 59 Años", "40 a 59 Años", 40),
    AgeGroup("Mayor de 60 Años", ">= 60 Años", 60),
)
EDA_AGE_GROUPS = (
    AgeGroup("Menor de 1 Año", "< 1 Año", 0),
    AgeGroup("De 1 a 4 Años", "1 a 4 Años", 1),
    *(AgeGroup(f"De {s} a {s + 4} Años", f"{s} a {s + 4} Años", s) for s in range(5, 80, 5)),
    AgeGroup("Mayor de 80 Años", ">= 80 Años", 80),
)


def _classify(groups: tuple[AgeGroup, ...], age: int | None, age_type: str) -> str:
    """Meses y Días son siempre menores de un año; Años usa el rango; lo demás queda sin grupo."""
    kind = _age_kind(age_type)
    if kind in ("meses", "dias"):
        return groups[0].label
    if kind != "anos" or age is None or age < 0:
        return ""
    return next(group.label for group in reversed(groups) if age >= group.minimum)


def ira_group(age: int | None, age_type: str) -> str:
    return _classify(IRA_AGE_GROUPS, age, age_type)


def eda_group(age: int | None, age_type: str) -> str:
    return _classify(EDA_AGE_GROUPS, age, age_type)


def _age_kind(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    return text.strip().lower()


@dataclass(frozen=True, slots=True)
class Age:
    value: int
    kind: str  # "Años" | "Meses" | "Días"


_LABELS = {"anos": "Años", "meses": "Meses", "dias": "Días"}


def parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def age_from_dates(birth: date, attention: date) -> Age:
    """Misma regla de la query: años, meses o días cumplidos, el primero que sea >= 1."""
    years = (
        attention.year - birth.year - ((attention.month, attention.day) < (birth.month, birth.day))
    )
    if years >= 1:
        return Age(years, "Años")
    months = (attention.year - birth.year) * 12 + attention.month - birth.month
    months -= attention.day < birth.day
    if months >= 1:
        return Age(months, "Meses")
    return Age((attention - birth).days, "Días")


def resolve_age(sql_age: Any, sql_type: Any, birth: Any, attention: Any) -> Age | None:
    """Valida `edad`/`tipo_edad` de la query contra las fechas (prevalecen si difieren)."""
    reported: Age | None = None
    kind = _LABELS.get(_age_kind(sql_type))
    try:
        if kind is not None and sql_age not in (None, ""):
            number = int(float(sql_age))
            reported = Age(number, kind) if number >= 0 else None
    except TypeError, ValueError:
        reported = None
    born, seen = parse_date(birth), parse_date(attention)
    if born is None or seen is None or born > seen:
        return reported
    return age_from_dates(born, seen)


def normalize_sex(value: Any) -> str:
    """'F' o 'M'; cualquier otro valor queda vacío para no asignarlo arbitrariamente."""
    text = _age_kind(value)
    if text in ("f", "femenino"):
        return "F"
    if text in ("m", "masculino"):
        return "M"
    return ""


def full_name(*parts: Any) -> str:
    return " ".join(word for part in parts if part is not None for word in str(part).split())


def epidemiological_period(reference: date) -> tuple[int, int, int]:
    """(semana, periodo, año) epidemiológicos INS: semanas domingo-sábado; la 1 contiene el 4-ene.

    El periodo agrupa 4 semanas (13 por año).
    """

    def week_one_start(year: int) -> date:
        jan4 = date(year, 1, 4)
        return jan4 - timedelta(days=(jan4.weekday() + 1) % 7)

    year = reference.year
    if reference >= week_one_start(year + 1):
        year += 1
    elif reference < week_one_start(year):
        year -= 1
    week = (reference - week_one_start(year)).days // 7 + 1
    return week, min((week - 1) // 4 + 1, 13), year
