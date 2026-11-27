"""Read-only application query derived from data_ips/Incapacidades.sql.

Keep the original joins for report fields, aliases, and inclusive start-date range.
Omit unrelated projections/joins; bind dates and company IDs and add paging.
"""

from nexora.integration_management.application.ports import ReadOnlyQuery
from nexora.statistics.application.incapacities import (
    COLUMNS,
    EMPTY_TEXT_FIELDS,
    EXTENSION_LABELS,
    INITIAL_STATUS,
    TEXT_EQUIVALENCES,
)
from nexora.statistics.infrastructure.queries.export_sql import derive_export_sql

_SEARCH_COLLATION = "Latin1_General_100_CI_AS"


def _literal(value: str) -> str:
    return "N'" + value.replace("'", "''") + "'"


def _search_predicate() -> str:
    # Search the values shown in the report, not the raw descriptions that they replace.
    extension_cases = " ".join(
        f"WHEN {value} THEN {_literal(label)}" for value, label in EXTENSION_LABELS.items()
    )
    overrides = {
        "nombre_medico": "LTRIM(RTRIM(CONCAT(nmbrs, ' ', apllds)))",
        "estado_incapacidad": _literal(INITIAL_STATUS),
        "prrga": f"CASE prrga {extension_cases} END",
    }
    for key, mapping in TEXT_EQUIVALENCES.items():
        cases = " ".join(
            f"WHEN {_literal(raw)} THEN {_literal(label)}" for raw, label in mapping.items()
        )
        overrides[key] = f"CASE {key} COLLATE {_SEARCH_COLLATION} {cases} ELSE {key} END"
    fields = (
        overrides.get(key, key)
        for key, _, kind in COLUMNS
        if kind == "text" and key not in EMPTY_TEXT_FIELDS
    )
    return "\n    OR ".join(
        f"CHARINDEX(:search, COALESCE(CAST({field} AS NVARCHAR(MAX)), N'') "
        f"COLLATE {_SEARCH_COLLATION}) > 0"
        for field in fields
    )


INCAPACITIES_SQL = f"""
SET NOCOUNT ON;
WITH filtered AS (
SELECT
    hc.unco AS historia_id,
    LTRIM(RTRIM(ISNULL(s.dscrpcn, '')))                     AS sede,
    LTRIM(RTRIM(CAST(s.idntfccn_sde AS VARCHAR(30))))       AS idntfccn_sde,
    inc.cnsctvo_incpcdds,
    hc.fcha_atncn,
    LTRIM(RTRIM(ISNULL(td.cdgo, '')))                       AS tipo_idntfccn,
    LTRIM(RTRIM(CAST(afl.nmro_idntfccn AS VARCHAR(30))))    AS nmro_idntfccn,
    LTRIM(RTRIM(ISNULL(afl.prmr_nmbre, '')))                AS prmr_nmbre,
    LTRIM(RTRIM(ISNULL(afl.sgndo_nmbre, '')))               AS sgndo_nmbre,
    LTRIM(RTRIM(ISNULL(afl.prmr_aplldo, '')))               AS prmr_aplldo,
    LTRIM(RTRIM(ISNULL(afl.sgndo_aplldo, '')))              AS sgndo_aplldo,
    LTRIM(RTRIM(ISNULL(emp.dscrpcn_crta, '')))              AS empresa,
    inc.fcha_incpcdd,
    inc.ds_incpcdd,
    -- El dia de inicio cuenta como primer dia de incapacidad
    DATEADD(DAY, inc.ds_incpcdd - 1, CAST(inc.fcha_incpcdd AS DATE)) AS fcha_fin_incpcdd,
    inc.prrga,
    LTRIM(RTRIM(ISNULL(ca.dscrpcn, '')))                    AS clse_atencn,
    LTRIM(RTRIM(ISNULL(dg.cdgo_dgnstco, '')))               AS cdgo_dgnstco,
    LTRIM(RTRIM(ISNULL(dg.dscrpcn, '')))                    AS diagnostico,
    LTRIM(RTRIM(ISNULL(ps.nmbrs, '')))                      AS nmbrs,
    LTRIM(RTRIM(ISNULL(ps.apllds, '')))                     AS apllds,
    LTRIM(RTRIM(ISNULL(esp.dscrpcn, '')))                   AS especialidad,
    LTRIM(RTRIM(ISNULL(tdp.cdgo, '')))                      AS tpo_idntfccn_prfsnl,
    LTRIM(RTRIM(CAST(ps.nmro_idntfccn AS VARCHAR(30))))     AS idntfccn_prfsnl,
    LTRIM(RTRIM(ISNULL(ps.rgstro_mdco, '')))                AS rgstro_mdco,
    LTRIM(RTRIM(ISNULL(tc.dscrpcn, '')))                    AS Contingencia
FROM tbIncapacidad inc WITH (NOLOCK)
JOIN tbHistoriasClinicas hc WITH (NOLOCK)
    ON hc.unco = inc.unco_hstra
LEFT JOIN tbSedesPuntosAtencion spa WITH (NOLOCK)
    ON spa.unco = hc.Unco_sde_pnto_atncn
LEFT JOIN tbSedes s WITH (NOLOCK)
    ON s.unco = spa.unco_sde
LEFT JOIN tbAfiliadosEmpresas ae WITH (NOLOCK)
    ON ae.unco = hc.Unco_afldo_emprsa
LEFT JOIN tbAfiliados afl WITH (NOLOCK)
    ON afl.unco = ae.unco_afldo
LEFT JOIN tbEmpresas emp WITH (NOLOCK)
    ON emp.unco = ae.unco_emprsa
LEFT JOIN tbTiposDocumentos td WITH (NOLOCK)
    ON td.unco = afl.unco_tpo_idntfccn
LEFT JOIN tbClaseAtencion ca WITH (NOLOCK)
    ON ca.unco = inc.unco_clse_atncn
LEFT JOIN tbDiagnosticos dg WITH (NOLOCK)
    ON dg.unco = hc.unco_dgnstco
LEFT JOIN tbProfesionalesSaludEspec pse WITH (NOLOCK)
    ON pse.unco = hc.unco_prfsnls_sld_espcldd
LEFT JOIN tbProfesionalesSalud ps WITH (NOLOCK)
    ON ps.unco = pse.unco_prfsnls_sld
LEFT JOIN tbTiposDocumentos tdp WITH (NOLOCK)
    ON tdp.unco = ps.unco_tpo_idntfccn
LEFT JOIN tbEspecialidades esp WITH (NOLOCK)
    ON esp.unco = pse.unco_espcldd
LEFT JOIN tbTipoContigencia tc WITH (NOLOCK)
    ON tc.unco = inc.unco_tpo_cntngnca
WHERE inc.fcha_incpcdd >= :fecha_inicial
  AND inc.fcha_incpcdd < DATEADD(DAY, 1, :fecha_final)
  AND (:filtrar_empresas = 0 OR ae.unco_emprsa IN :empresas)
)
SELECT *, COUNT(*) OVER () AS total_registros
FROM filtered
WHERE (:search = N''
    OR {_search_predicate()}
)
ORDER BY fcha_atncn ASC, historia_id, cnsctvo_incpcdds
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
"""

INCAPACITIES_QUERY = ReadOnlyQuery(
    "statistics.incapacities.page", INCAPACITIES_SQL, frozenset({"empresas"})
)
INCAPACITIES_EXPORT_QUERY = ReadOnlyQuery(
    "statistics.incapacities.export",
    derive_export_sql(INCAPACITIES_SQL, "Gestión de Incapacidades"),
    INCAPACITIES_QUERY.list_params,
)
