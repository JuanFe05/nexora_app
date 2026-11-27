"""Facturas Detalladas con una proyección exclusiva de Secretaría Gerencia."""

from nexora.integration_management.application.ports import ReadOnlyQuery
from nexora.statistics.domain.management_secretariat import COLUMNS
from nexora.statistics.infrastructure.queries.detailed_invoices import (
    DETAILED_INVOICES_QUERY,
    DETAILED_INVOICES_SQL,
)
from nexora.statistics.infrastructure.queries.export_sql import derive_export_sql

_DOCUMENT = (
    "CASE WHEN doc.prfjo_dcto IS NULL THEN CONVERT(VARCHAR(20), doc.cnsctvo_dcto) "
    "ELSE doc.prfjo_dcto + '-' + CONVERT(VARCHAR(20), doc.cnsctvo_dcto) END"
)
_AMOUNT = "d.cntdd * d.vlr_untro"
_EXPRESSIONS = {
    "sede": "s.dscrpcn",
    "emprs": "t.dscrpcn_emprsa_crta",
    "nmro_dcto": _DOCUMENT,
    "factura": f"CASE WHEN doc.tpo = 'F' THEN {_DOCUMENT} END",
    "fcha_dcto": "CONVERT(VARCHAR(10), doc.fcha_dcto, 23)",
    "lna_prdcto": "lp.dscrpcn",
    "admision": "doc.cnsctvo_admsns",
    "cdgo_prcdmnto": "CASE WHEN d.tpo_dtlle = 'SERVICIO' THEN d.cdgo_raw END",
    "rslcn": "NULL",
    "procedimiento": "d.dscr_raw",
    "cdgo_tpo_dcmnto": "td.cdgo",
    "cc_afldo": "t.nmro_idntfccn",
    "nombre_completo": "CONCAT_WS(' ', t.prmr_nmbre, t.sgndo_nmbre, t.prmr_aplldo, t.sgndo_aplldo)",
    "fcha_ingrso_pcnte": "CONVERT(VARCHAR(10), t.fcha_ingrso_pcnte, 23)",
    "fcha_egreso": "CONVERT(VARCHAR(10), COALESCE(t.fcha_egrso_pcnte, doc.fcha_slda_admsn), 23)",
    "prfsnl_salud_ordn": "CONCAT_WS(' ', ps_ordn.nmbrs, ps_ordn.apllds)",
    "prfsnl_salud_rlza": "CONCAT_WS(' ', ps_rlza.nmbrs, ps_rlza.apllds)",
    "cdgo_dgnstco": "dg1.cdgo_dgnstco",
    "dscrpcn_dgnstco": "dg1.dscrpcn",
    "vlr_srvcs": f"CASE WHEN d.tpo_dtlle = 'SERVICIO' THEN {_AMOUNT} ELSE 0 END",
    "vlr_smnstrs": f"CASE WHEN d.tpo_dtlle = 'SUMINISTRO' THEN {_AMOUNT} ELSE 0 END",
    "cntdd": "d.cntdd",
    "vlr_untro": "d.vlr_untro",
    "cntdd1": _AMOUNT,
    "total_cntdd1": "NULL",
    "vlr_copago": "NULL",
    "pago_tpo1": "NULL",
    "pago_tpo2": "NULL",
    "usrio_mdfca": "doc.usro_mdfccn",
    "nmro_atrzcn_eps": "d.nmro_atrzcn_eps",
    "mes_dcto": (
        "CHOOSE(MONTH(doc.fcha_dcto), 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', "
        "'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE')"
    ),
}


def _page_sql() -> str:
    # Mantener filtros, JOIN, exclusiones y orden de origen; sustituir solo el SELECT externo.
    start = "\nSELECT\n    LTRIM(RTRIM(s.dscrpcn))"
    end = "\nFROM cte_doc_x doc\n"
    where = "\nWHERE REPLACE(REPLACE(REPLACE(ISNULL(d.cdgo_raw"
    order = "\nORDER BY doc.fcha_dcto"
    if any(DETAILED_INVOICES_SQL.count(marker) != 1 for marker in (start, end, where, order)):
        raise RuntimeError("Cambió la estructura de SQL de Facturas Detalladas.")
    prefix = DETAILED_INVOICES_SQL.split(start)[0]
    joins, filters = DETAILED_INVOICES_SQL.split(end)[1].split(where)
    filters, paging = filters.split(order)
    projection = ",\n        ".join(f"{_EXPRESSIONS[key]} AS {key}" for key, _, _ in COLUMNS)
    search = "\n        OR ".join(
        f"CHARINDEX(@buscar, UPPER(CONVERT(NVARCHAR(MAX), invoice.{key}))) > 0"
        for key, _, _ in COLUMNS
        if _EXPRESSIONS[key] != "NULL"
    )
    return (
        "DECLARE @buscar NVARCHAR(200) = UPPER(:buscar);\n"
        + prefix
        + "\nSELECT invoice.*, COUNT(*) OVER () AS total_registros"
        + end
        + joins
        + f"\nCROSS APPLY (SELECT {projection}) invoice"
        + where
        + filters
        + f"\n  AND (@buscar = '' OR {search})"
        + order
        + paging
    )


_PAGE_SQL = _page_sql()
PAGE_QUERY = ReadOnlyQuery(
    name="statistics.management_secretariat_invoices",
    sql=_PAGE_SQL,
    list_params=DETAILED_INVOICES_QUERY.list_params,
)
EXPORT_QUERY = ReadOnlyQuery(
    name="statistics.management_secretariat_invoices_export",
    sql=derive_export_sql(_PAGE_SQL, "Secretaría Gerencia"),
    list_params=PAGE_QUERY.list_params,
)
