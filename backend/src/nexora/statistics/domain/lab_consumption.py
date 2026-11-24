"""Proyección DOCX de Laboratorio; las reglas de Facturas pertenecen a Consumo General."""

from collections.abc import Mapping
from typing import Any, Literal

from nexora.statistics.domain.general_billing import money, normalize_text, parse_date
from nexora.statistics.domain.general_consumption import fila_cumple

COLUMNS = (
    ("cnsctvo_dcto", "Transacción / Factura / Admisión", "text"),
    ("cdgo_prcdmnto", "CUPS", "text"),
    ("lna_prdcto", "Tipo Procedimiento", "text"),
    ("procedimiento", "Nombre Procedimiento", "text"),
    ("cntdd", "Cantidad", "number"),
    ("fcha_ingrso_pcnte", "Fecha Ingreso", "date"),
    ("fcha_dcto", "Fecha Factura", "date"),
    ("admision", "Admisión", "text"),
    ("estado", "Estado Documento", "text"),
    ("emprs", "Empresa", "text"),
    ("dscrp_transcn", "Tipo Documento", "text"),
    ("sede", "Sede", "text"),
)


def is_laboratory(value: Any) -> bool:
    return "LABORATORIO" in normalize_text(value)


def invoice_matches(row: Mapping[str, Any]) -> bool:
    return is_laboratory(row.get("lna_prdcto")) and fila_cumple(row)


def project_row(
    raw: Mapping[str, Any], source: Literal["facturas", "admisiones", "ser_laboral"]
) -> dict[str, Any]:
    values = dict(raw)
    if source == "admisiones":
        aliases = {
            "cnsctvo_dcto": "cnsctvo_admsn",
            "procedimiento": "prcdmnto",
            "fcha_ingrso_pcnte": "fcha_admsn",
            "fcha_dcto": "fcha_slda_admsn",
            "admision": "cnsctvo_admsn",
            "estado": "estdo_admsn",
            "emprs": "emprsa",
        }
        values.update({key: raw.get(alias) for key, alias in aliases.items()})
        values["dscrp_transcn"] = "ADMISIÓN"
    elif source == "ser_laboral":
        values.update(fcha_ingrso_pcnte=raw.get("fcha_dcto"), admision="", estado="CERRADO")
    row: dict[str, Any] = {}
    for key, _, kind in COLUMNS:
        value = values.get(key)
        if kind == "date":
            parsed = parse_date(value)
            row[key] = parsed.isoformat() if parsed else ""
        elif kind == "number":
            row[key] = money(value)
        else:
            row[key] = normalize_text(value)
    return row
