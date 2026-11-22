"""ETL de Facturación General en streaming: una factura a la vez, filtrando antes de totalizar."""

from collections.abc import AsyncGenerator, AsyncIterator
from decimal import Decimal
from typing import Any

from nexora.statistics.domain.general_billing import (
    add_money,
    age_from_dates,
    course_of_life,
    invoice_key,
    money,
    month_name,
    normalize_text,
    parse_date,
    payments,
    row_matches,
)

# Clave de la API, encabezado exacto de la tabla y la exportación, y tipo de dato.
COLUMNS = (
    ("sede", "Sede", "text"),
    ("emprs", "Empresa", "text"),
    ("prfjo_dcto", "Prefijo Documento", "text"),
    ("cnsctvo_dcto", "No. Transacción / No. Documento / No. Admisión", "text"),
    ("dscrp_transcn", "Tipo Documento", "text"),
    ("fcha_dcto", "Fecha Factura", "date"),
    ("pnto_atncn", "Punto Atención / Servicio", "text"),
    ("lna_prdcto", "Tipo Atención / Servicio", "text"),
    ("admision", "No. Admisión", "text"),
    ("cdgo_prcdmnto", "Código (Interno / CUPS)", "text"),
    ("rslcn", "Código (CUMS)", "text"),
    ("procedimiento", "Descripción Servicio / Procedimiento", "longtext"),
    ("cdgo_tpo_dcmnto", "Tipo Id. Paciente", "text"),
    ("cc_afldo", "Número Id. Paciente", "text"),
    ("nombre_completo", "Nombre Paciente", "text"),
    ("fcha_ncmnto", "F. Nacimiento Paciente", "date"),
    ("edad", "Edad Paciente", "number"),
    ("tipo_edad", "Tipo Edad Paciente", "text"),
    ("grupo_etario", "Grupo Etario", "text"),
    ("genero", "Sexo Paciente", "text"),
    ("mncpo_rsdncia", "Municipio Residencia", "text"),
    ("drccn", "Dirección Residencia", "longtext"),
    ("fcha_ingrso_pcnte", "F. Ingreso Paciente", "date"),
    ("fcha_egreso", "F. Egreso Paciente", "date"),
    ("prfsnl_salud_ordn", "Nombre Médico Ordena", "text"),
    ("prfsnl_salud_rlza", "Nombre Médico Realiza", "text"),
    ("cdgo_dgnstco", "Cod. Dx", "text"),
    ("dscrpcn_dgnstco", "Descripción DX (CIE10)", "longtext"),
    ("vlr_srvcs", "Valor Servicios", "money"),
    ("vlr_smnstrs", "Valor Suministros", "money"),
    ("cntdd", "Cantidad", "number"),
    ("vlr_untro", "Valor Unitario", "money"),
    ("cntdd1", "Cantidad × Vlr. Unitario", "money"),
    ("total_cntdd1", "Vlr. Total Servicios / Suministros", "money"),
    ("vlr_copago", "Vlr. Copago & Cuota Moderadora", "money"),
    ("pago_tpo1", "Pago Particular", "money"),
    ("pago_tpo2", "Descuento", "money"),
    ("usrio_mdfca", "Asesor / Facturador", "text"),
    ("nmro_atrzcn_eps", "Autorización", "text"),
    ("cnsctvo_fctra_agrpda", "Relación Factura Agrupada", "text"),
    ("no_remision", "No. Remisión", "text"),
    ("fcha_rmsn", "Fecha Remisión", "date"),
    ("no_envio", "Relación de Envío", "text"),
    ("mes_dcto", "Nombre Mes", "text"),
)
Row = dict[str, Any]


def clean_record(raw: Row) -> Row:
    """Fila de salida: texto en mayúsculas, fechas ISO, importes exactos y edad calculada."""
    row: Row = {}
    for key, _, kind in COLUMNS:
        value = raw.get(key)
        if kind == "date":
            parsed = parse_date(value)
            row[key] = parsed.isoformat() if parsed else ""
        elif kind in {"money", "number"}:
            row[key] = money(value)
        else:
            row[key] = normalize_text(value)
    row["nombre_completo"] = normalize_text(
        " ".join(
            normalize_text(raw.get(key))
            for key in ("prmr_nmbre", "sgndo_nmbre", "prmr_aplldo", "sgndo_aplldo")
        )
    )
    birth, reference = raw.get("fcha_ncmnto"), raw.get("fcha_dcto")
    row["edad"], row["tipo_edad"] = age_from_dates(birth, reference)
    row["grupo_etario"] = course_of_life(birth, reference)
    row["mes_dcto"] = month_name(reference)
    row["total_cntdd1"] = 0
    row["vlr_copago"], row["pago_tpo1"], row["pago_tpo2"] = 0, 0, 0
    return row


async def process_chunks(chunks: AsyncIterator[list[Row]]) -> AsyncGenerator[Row]:
    """Consume SQL una sola vez; solo las filas de la factura en curso ocupan memoria.

    La consulta entrega las filas de cada factura de forma contigua. Una fila defectuosa se
    omite y los valores sueltos inválidos se normalizan a vacío o cero. El total de la factura
    y los pagos (copago, pago particular y descuento) se asignan solo a su primera fila.
    """
    group: list[Row] = []
    current: tuple[str, str, str] | None = None
    total: int | Decimal = 0
    try:
        async for chunk in chunks:
            for raw in chunk:
                try:
                    if not row_matches(raw):
                        continue
                    key = invoice_key(raw)
                    row = clean_record(raw)
                    copago, payment1, payment2 = payments(raw)
                except Exception:  # noqa: S112 -- se omite la fila defectuosa sin registrar datos del paciente
                    continue
                if group and key != current:
                    group[0]["total_cntdd1"] = money(total)
                    for previous in group:
                        yield previous
                    group = []
                    total = 0
                if not group:
                    current = key
                    row["vlr_copago"], row["pago_tpo1"], row["pago_tpo2"] = (
                        copago,
                        payment1,
                        payment2,
                    )
                total = add_money(total, row["cntdd1"])
                group.append(row)
        if group:
            group[0]["total_cntdd1"] = money(total)
            for row in group:
                yield row
    finally:
        close = getattr(chunks, "aclose", None)
        if close is not None:
            await close()
