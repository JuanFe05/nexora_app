"""Contrato de columnas compartible por las fuentes de Secretaría Gerencia."""

import re
from decimal import Decimal
from typing import Any, Literal

ColumnKind = Literal["text", "identifier", "date", "number"]
COLUMNS: tuple[tuple[str, str, ColumnKind], ...] = (
    ("sede", "Sede", "text"),
    ("emprs", "Empresa", "text"),
    ("nmro_dcto", "No. Transacción / No. Documento / No. Admisión", "identifier"),
    ("factura", "Factura", "identifier"),
    ("fcha_dcto", "Fecha Factura", "date"),
    ("lna_prdcto", "Tipo Atención / Servicio", "text"),
    ("admision", "No. Admisión", "identifier"),
    ("cdgo_prcdmnto", "Código (Interno / CUPS)", "identifier"),
    ("rslcn", "Código (CUMS)", "identifier"),
    ("procedimiento", "Descripción Servicio / Procedimiento", "text"),
    ("cdgo_tpo_dcmnto", "Tipo Id. Paciente", "identifier"),
    ("cc_afldo", "Número Id. Paciente", "identifier"),
    ("nombre_completo", "Nombre Paciente", "text"),
    ("fcha_ingrso_pcnte", "F. Ingreso Paciente", "date"),
    ("fcha_egreso", "F. Egreso Paciente", "date"),
    ("prfsnl_salud_ordn", "Nombre Médico Ordena", "text"),
    ("prfsnl_salud_rlza", "Nombre Médico Realiza", "text"),
    ("cdgo_dgnstco", "Cod. Dx", "identifier"),
    ("dscrpcn_dgnstco", "Descripción DX (CIE10)", "text"),
    ("vlr_srvcs", "Valor Servicios", "number"),
    ("vlr_smnstrs", "Valor Suministros", "number"),
    ("cntdd", "Cantidad", "number"),
    ("vlr_untro", "Valor Unitario", "number"),
    ("cntdd1", "Cantidad * Vlr. Unitario", "number"),
    ("total_cntdd1", "Vlr. Total Servicios / Suministros", "number"),
    ("vlr_copago", "Vlr. Copago & Cuota Moderadora", "number"),
    ("pago_tpo1", "Pago Particular", "number"),
    ("pago_tpo2", "Descuento", "number"),
    ("usrio_mdfca", "Asesor / Facturador", "text"),
    ("nmro_atrzcn_eps", "Autorización", "identifier"),
    ("mes_dcto", "Nombre Mes", "text"),
)

_CONTROLS = re.compile(r"[\x00-\x1f\x7f]")


def clean_sql_row(row: dict[str, Any]) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for key, _, kind in COLUMNS:
        raw = row.get(key)
        if raw is None:
            result[key] = None
            continue
        value = format(raw, "f") if isinstance(raw, Decimal) else str(raw)
        if kind == "text":
            value = " ".join(_CONTROLS.sub(" ", value).split())
        else:
            # Identificadores: no borrar caracteres internos ni convertirlos a número.
            value = value.strip()
        result[key] = value or None
    return result
