"""Pipeline de la Notificación SIVIGILA: limpia, valida y clasifica una sola lectura de la query."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from nexora.statistics.application.ports import CatalogOption, ReportSource
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.domain.sivigila import (
    EDA_AGE_GROUPS,
    EVENT_DENGUE,
    EVENT_EDA,
    EVENT_IRA,
    EVENT_RABIA,
    EVENT_VARICELA,
    IRA_AGE_GROUPS,
    AgeGroup,
    eda_group,
    epidemiological_period,
    events_for_codes,
    full_name,
    ira_group,
    normalize_sex,
    notification_location,
    notification_title,
    parse_date,
    resolve_age,
)

Row = dict[str, Any]

GENERAL = "general"
TABS = (GENERAL, EVENT_IRA, EVENT_EDA, EVENT_DENGUE, EVENT_VARICELA, EVENT_RABIA)

# (clave de salida, encabezado, tipo de exportación)
COLUMNS = (
    ("sede", "Sede", "text"),
    ("servicio", "Servicio", "text"),
    ("tipo_documento", "Tipo Documento", "text"),
    ("no_documento", "No. Documento", "text"),
    ("empresa", "Empresa", "text"),
    ("sexo", "Sexo", "text"),
    ("nombre_completo", "Nombre Completo", "text"),
    ("fecha_nacimiento", "Fecha Nacimiento", "date"),
    ("fecha_atencion", "Fecha Atencion", "date"),
    ("edad", "Edad", "number"),
    ("tipo_edad", "Tipo Edad", "text"),
    ("grupo", "Grupo", "text"),
    ("dx_principal", "DX Principal", "text"),
    ("desc_dx_principal", "Descripcion DX Principal", "text"),
    ("dx_relacionado_uno", "DX Relacionado Uno", "text"),
    ("desc_dx_relacionado_uno", "Descripcion DX Relacionado Uno", "text"),
    ("dx_relacionado_dos", "DX Relacionado Dos", "text"),
    ("desc_dx_relacionado_dos", "Descripcion DX Relacionado Dos", "text"),
    ("medico", "Médico", "text"),
    ("especialidad", "Especialidad", "text"),
)
GROUP_LABELS = {EVENT_IRA: "Grupo IRA", EVENT_EDA: "Grupo EDA"}
REQUIRED_SPECIALTY = "MEDICINA GENERAL"
DX_FIELDS = ("cdgo_dgnstco", "cdgo_dgnstco_rl_1", "cdgo_dgnstco_rl_2")


@dataclass(frozen=True, slots=True)
class AnalysisRow:
    etiqueta: str
    valores: list[int]
    total: int


@dataclass(frozen=True, slots=True)
class AnalysisTable:
    titulo: str
    columnas: list[str]
    filas: list[AnalysisRow]


@dataclass(slots=True)
class SivigilaResult:
    titulo: str
    subtitulo: str
    semana: int
    periodo: int
    anio: int
    ira: AnalysisTable
    eda: AnalysisTable
    pestanas: dict[str, list[Row]]
    advertencias: list[str] = field(default_factory=list)
    total_registros: int = 0


def _text(value: Any) -> str:
    return "" if value is None else " ".join(str(value).split())


def _date_text(value: Any) -> str:
    parsed = parse_date(value)
    return parsed.isoformat() if parsed else ""


def clean_record(raw: Row) -> tuple[Row, frozenset[str]]:
    """Fila de salida normalizada (sin grupo) y los eventos de sus tres diagnósticos."""
    age = resolve_age(
        raw.get("edad"), raw.get("tipo_edad"), raw.get("fcha_ncmnto"), raw.get("fcha_atncn")
    )
    row: Row = {
        "sede": _text(raw.get("sede")),
        "servicio": _text(raw.get("linea_servicio")),
        "tipo_documento": _text(raw.get("tipo_documento")),
        # El documento conserva su valor original (ceros a la izquierda incluidos).
        "no_documento": "" if raw.get("nmro_idntfccn") is None else str(raw["nmro_idntfccn"]),
        "empresa": _text(raw.get("empresa")),
        "sexo": _text(raw.get("gener")),
        "nombre_completo": full_name(
            raw.get("prmr_nmbre"),
            raw.get("sgndo_nmbre"),
            raw.get("prmr_aplldo"),
            raw.get("sgndo_aplldo"),
        ),
        "fecha_nacimiento": _date_text(raw.get("fcha_ncmnto")),
        "fecha_atencion": _date_text(raw.get("fcha_atncn")),
        "edad": age.value if age else None,
        "tipo_edad": age.kind if age else "",
        "grupo": "",
        "dx_principal": _text(raw.get("cdgo_dgnstco")),
        "desc_dx_principal": _text(raw.get("diagnostico")),
        "dx_relacionado_uno": _text(raw.get("cdgo_dgnstco_rl_1")),
        "desc_dx_relacionado_uno": _text(raw.get("diagnostico_rl_1")),
        "dx_relacionado_dos": _text(raw.get("cdgo_dgnstco_rl_2")),
        "desc_dx_relacionado_dos": _text(raw.get("diagnostico_rl_2")),
        "medico": _text(raw.get("profesional_salud")),
        "especialidad": _text(raw.get("especialidad")),
    }
    return row, events_for_codes(raw.get(name) for name in DX_FIELDS)


def _table(
    title: str, groups: Sequence[AgeGroup], rows: list[tuple[str, list[int]]]
) -> AnalysisTable:
    return AnalysisTable(
        title,
        [group.header for group in groups],
        [AnalysisRow(label, values, sum(values)) for label, values in rows],
    )


def process_rows(
    rows: Iterable[Row], *, fallback_date: date, selected_sites: Sequence[str] = ()
) -> SivigilaResult:
    """Construye análisis y pestañas desde una sola lectura.

    `selected_sites` son los nombres de las sedes filtradas (vacío = todas) y solo definen el
    encabezado; los datos ya llegan filtrados. La semana se calcula con la primera fecha de
    atención de General (como `EscribirPeriodoEpidemiologico`); sin registros, `fallback_date`.
    """
    tabs: dict[str, list[Row]] = {tab: [] for tab in TABS}
    ira_labels = [g.label for g in IRA_AGE_GROUPS]
    eda_labels = [g.label for g in EDA_AGE_GROUPS]
    ira_event = [0] * len(ira_labels)
    ira_all = [0] * len(ira_labels)
    eda_counts = {"F": [0] * len(eda_labels), "M": [0] * len(eda_labels)}
    skipped = no_age = eda_no_sex = eda_no_age = 0

    for raw in rows:
        try:
            if _text(raw.get("especialidad")).upper() != REQUIRED_SPECIALTY:
                continue  # solo cuenta MEDICINA GENERAL; las demás se ignoran
            row, events = clean_record(raw)
            sex = normalize_sex(raw.get("gener"))
        except Exception:  # un registro defectuoso no debe detener el resto
            skipped += 1
            continue
        age, kind = row["edad"], row["tipo_edad"]
        ira, eda = ira_group(age, kind), eda_group(age, kind)
        if not ira:
            no_age += 1
        else:
            ira_all[ira_labels.index(ira)] += 1
        tabs[GENERAL].append(row)
        for event in events:
            group = ira if event == EVENT_IRA else eda if event == EVENT_EDA else ""
            tabs[event].append({**row, "grupo": group})
        if EVENT_IRA in events and ira:
            ira_event[ira_labels.index(ira)] += 1
        if EVENT_EDA in events:
            if not eda:
                eda_no_age += 1
            elif not sex:
                eda_no_sex += 1
            else:
                eda_counts[sex][eda_labels.index(eda)] += 1

    reference = next(
        (parsed for row in tabs[GENERAL] if (parsed := parse_date(row["fecha_atencion"]))),
        fallback_date,
    )
    week, period, year = epidemiological_period(reference)
    totals = [f + m for f, m in zip(eda_counts["F"], eda_counts["M"], strict=True)]
    warnings = []
    if skipped:
        warnings.append(f"{skipped} registro(s) con datos inválidos fueron omitidos.")
    if no_age:
        warnings.append(f"{no_age} registro(s) sin edad válida no se cuentan por grupo de edad.")
    if eda_no_sex:
        warnings.append(f"{eda_no_sex} registro(s) EDA con sexo no reconocido no se asignaron.")
    if eda_no_age:
        warnings.append(f"{eda_no_age} registro(s) EDA sin edad válida no se asignaron.")
    return SivigilaResult(
        titulo=notification_title(notification_location(selected_sites)),
        subtitulo=f"SEMANA {week:02d} PERIODO {period:02d} {year}",
        semana=week,
        periodo=period,
        anio=year,
        ira=_table(
            "Notificación IRA",
            IRA_AGE_GROUPS,
            [
                ("Total Consultas externas y urgencias (IRA)", ira_event),
                ("Total Consultas externas y urgencias", ira_all),
            ],
        ),
        eda=_table(
            "Notificación EDA",
            EDA_AGE_GROUPS,
            [
                ("F (Femenino)", eda_counts["F"]),
                ("M (Masculino)", eda_counts["M"]),
                ("Total general", totals),
            ],
        ),
        pestanas=tabs,
        advertencias=warnings,
        total_registros=len(tabs[GENERAL]),
    )


class SivigilaReport:
    """Una sola lectura de la query de Signos Vitales alimenta todas las pestañas."""

    def __init__(self, source: ReportSource) -> None:
        self._source = source

    async def sites(self) -> list[CatalogOption]:
        return await self._source.sites()

    async def companies(self) -> list[CatalogOption]:
        return await self._source.companies()

    async def product_lines(self) -> list[CatalogOption]:
        return await self._source.product_lines()

    async def build(self, filter: ReportFilter) -> SivigilaResult:
        records: list[Row] = []
        async for chunk in self._source.stream(filter):
            records.extend(chunk)
        selected = await self._selected_sites(filter, records)
        return process_rows(records, fallback_date=filter.fecha_final, selected_sites=selected)

    async def _selected_sites(self, filter: ReportFilter, records: list[Row]) -> list[str]:
        """Nombres de las sedes filtradas; vacío si no hay restricción (todas las sedes)."""
        if not filter.sedes:
            return []
        try:
            catalog = {site.id: site.nombre for site in await self._source.sites()}
            names = [catalog[i] for i in filter.sedes if i in catalog]
            if len(names) != len(filter.sedes):
                names = []
        except Exception:  # sin catálogo, se identifican por las sedes presentes en los datos
            names = []
        return names or list(dict.fromkeys(_text(r.get("sede")) for r in records))


def ensure_consistent(report: SivigilaResult) -> None:
    """Valida la forma de un resultado recibido para exportar; los datos se usan tal cual."""
    if set(report.pestanas) != set(TABS):
        raise InvalidReportFilter("El resultado no contiene exactamente las siete pestañas.")
    for table in (report.ira, report.eda):
        if any(len(row.valores) != len(table.columnas) for row in table.filas):
            raise InvalidReportFilter("Las tablas de análisis son inconsistentes.")
