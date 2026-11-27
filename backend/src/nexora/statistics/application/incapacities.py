"""Column catalog and shared table/export transformations for Gestión de Incapacidades."""

from dataclasses import dataclass
from datetime import date
from typing import Any

from nexora.statistics.application.export import ColumnType
from nexora.statistics.domain.filters import ReportFilter

COLUMNS: tuple[tuple[str, str, ColumnType], ...] = (
    ("tipo_idntfccn", "Tipo de identificación", "text"),
    ("nmro_idntfccn", "Identificación", "text"),
    ("prmr_nmbre", "Primer nombre", "text"),
    ("sgndo_nmbre", "Segundo nombre", "text"),
    ("prmr_aplldo", "Primer apellido", "text"),
    ("sgndo_aplldo", "Segundo apellido", "text"),
    ("empresa", "Empresa", "text"),
    ("fcha_atncn", "Fecha de solicitud", "date"),
    ("idntfccn_sde", "Código IPS", "text"),
    ("sede", "Descripción IPS", "text"),
    ("fcha_incpcdd", "Fecha de inicio", "date"),
    ("fcha_fin_incpcdd", "Fecha de fin", "date"),
    ("ds_incpcdd", "Duración", "number"),
    ("prrga", "Prórroga", "text"),
    ("Contingencia", "Origen de la patología", "text"),
    ("tpo_idntfccn_prfsnl", "Tipo de identificación médico", "text"),
    ("idntfccn_prfsnl", "Número de identificación del médico", "text"),
    ("rgstro_mdco", "Número del registro médico", "text"),
    ("nombre_medico", "Nombre del médico", "text"),
    ("especialidad", "Especialidad del médico", "text"),
    ("fecha_probable_parto", "Fecha probable de parto", "text"),
    ("fecha_probable_nacimiento", "Fecha probable de nacimiento", "text"),
    ("cdgo_dgnstco", "Código del diagnóstico", "text"),
    ("diagnostico", "Descripción del diagnóstico", "text"),
    ("lateralidad", "Lateralidad", "text"),
    ("clse_atencn", "Modalidad de atención", "text"),
    ("estado_incapacidad", "Estado de la incapacidad", "text"),
    ("cnsctvo_incpcdds", "Número de la solicitud", "text"),
)
_IPS = {
    "sede 3 cra 19 # 10-52": "IPS CLINICA SALUD FLORIDA SEDE FLORIDA VALLE",
    "florida-cra 19 # 10-32": "IPS CLINICA SALUD FLORIDA SEDE FLORIDA VALLE",
    "corinto-cl 7 # 7 -79": "IPS CLINICA SALUD FLORIDA SEDE CORINTO CAUCA",
    "miranda-cl 10 # 7-31": "IPS CLINICA SALUD FLORIDA SEDE MIRANDA CAUCA",
}
_ORIGIN = {
    "accidente de trabajo": "AT",
    "enfermedad profesional": "EP",
    "enfermedad general": "EG",
    "accidente de tránsito": "ES",
}
_MODALITY = {
    "ambulatoria quirúrgica": "Ambulatoria electiva",
    "hospitalaria electiva": "Ambulatoria electiva",
    "hospitalaria urgencias": "Ambulatoria urgencias",
}

TEXT_EQUIVALENCES = {"sede": _IPS, "Contingencia": _ORIGIN, "clse_atencn": _MODALITY}
EMPTY_TEXT_FIELDS = ("fecha_probable_parto", "fecha_probable_nacimiento", "lateralidad")
EXTENSION_LABELS = {0: "I", 1: "P"}
INITIAL_STATUS = "Inicial"


@dataclass(frozen=True, slots=True)
class IncapacitiesFilter(ReportFilter):
    search: str = ""


def _equivalence(value: str, mapping: dict[str, str]) -> str:
    return mapping.get(value.strip().casefold(), value)


def transform_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Expose only the report catalog; keep identifiers and unknown descriptions unchanged."""
    row = {key: raw.get(key) for key, _, _ in COLUMNS}
    for key in ("fcha_atncn", "fcha_incpcdd", "fcha_fin_incpcdd"):
        value = row[key]
        row[key] = (
            f"{value.day:02d}/{value.month:02d}/{value.year:04d}" if isinstance(value, date) else ""
        )
    for key, mapping in TEXT_EQUIVALENCES.items():
        row[key] = _equivalence(row[key] or "", mapping)
    row["prrga"] = EXTENSION_LABELS.get(raw.get("prrga"), "")
    row["nombre_medico"] = " ".join(raw[key] for key in ("nmbrs", "apllds") if raw.get(key))
    for key in EMPTY_TEXT_FIELDS:
        row[key] = ""
    row["estado_incapacidad"] = INITIAL_STATUS
    return row
