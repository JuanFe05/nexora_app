"""Proyección común de Facturas Detalladas y Admisiones para Encuestas de Calidad."""

from collections.abc import Mapping
from typing import Any

# Clave pública (alias de Facturas), encabezado y alias de Admisiones.
COLUMNS = (
    ("sede", "Sede", "sede"),
    ("cdgo_tpo_dcmnto", "Tipo Id. Paciente", "tpo_idntfccn"),
    ("cc_afldo", "Número Id. Paciente", "nmro_idntfccn"),
    ("nombre_completo", "Nombre", "nombre_completo"),
    ("genero", "Sexo", "sexo"),
    ("tlfno_afldo", "Teléfono", "tlfno"),
    ("emprs", "Empresa", "emprsa"),
    ("prfsnl_salud_rlza", "Profesional Realiza", "prfsnl_ordna"),
    ("cdgo_prcdmnto", "CUPS Servicio", "cdgo_prcdmnto"),
    ("procedimiento", "Servicio", "prcdmnto"),
    ("lna_prdcto", "Tipo Servicio", "lna_prdcto"),
)
NAME_PARTS = ("prmr_nmbre", "sgndo_nmbre", "prmr_aplldo", "sgndo_aplldo")
ADMISSIONS_CUPS = "890701"
EXCLUDED_PRODUCT_LINES = frozenset({"medicamento", "material - insumo medico qx"})


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def project(raw: Mapping[str, Any], *, admission: bool) -> dict[str, str]:
    parts = (_text(raw.get(key)).strip() for key in NAME_PARTS)
    name = " ".join(part for part in parts if part)
    return {
        key: name if key == "nombre_completo" else _text(raw.get(alias if admission else key))
        for key, _, alias in COLUMNS
    }
