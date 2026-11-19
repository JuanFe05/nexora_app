"""Admisiones, derivada de Admisiones.sql e incluida en el paquete.

Diff respecto al original: SET NOCOUNT ON; fechas enlazadas; filtros de sede,
empresa y linea en el WHERE final; COUNT(*) OVER (); columna unco_dtlle en
cte_det como desempate estable y OFFSET/FETCH. Las 59 columnas, calculos, joins
y reglas originales se conservan. La exportacion se deriva del SQL paginado con
el mecanismo compartido.
"""

# ruff: noqa: E501 -- SQL original conservado para permitir auditoria por diff.
from nexora.integration_management.application.ports import ReadOnlyQuery
from nexora.statistics.infrastructure.queries.export_sql import derive_export_sql

ADMISSIONS_SQL = r"""
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- PARAMETROS: fechas de admision (ambas inclusivas)
DECLARE @fcha_inicio DATE = CAST(:fecha_inicial AS DATE);
DECLARE @fcha_fin    DATE = CAST(:fecha_final AS DATE);
DECLARE @fcha_tope   DATE = DATEADD(DAY, 1, @fcha_fin); -- límite exclusivo interno

-- Solo lectura: variable de tabla (DECLARE), sin CREATE/INSERT sobre objetos de la base.
-- Tipos asumidos: unco_* BIGINT; la función puede devolver VARCHAR/NVARCHAR, se usa NVARCHAR(4000) para no perder caracteres.
DECLARE @def TABLE (
    unco_emprsa   BIGINT NOT NULL,
    unco_prcdmnto BIGINT NOT NULL,
    cdgo_raw      NVARCHAR(4000) NULL,
    dscr_raw      NVARCHAR(4000) NULL,
    PRIMARY KEY (unco_emprsa, unco_prcdmnto)
);

-- La función escalar se evalúa una sola vez por par DISTINCT (empresa, procedimiento) del periodo,
-- por encima del DISTINCT; antes se ejecutaba hasta 3 veces por fila de detalle (2 en SELECT + 1 en WHERE).
INSERT INTO @def (unco_emprsa, unco_prcdmnto, cdgo_raw, dscr_raw)
SELECT
    p.unco_emprsa,
    p.unco_prcdmnto,
    LTRIM(RTRIM(dbo.fnobtenerDefinicionProcedimento(p.unco_emprsa, p.unco_prcdmnto, 1))),
    LTRIM(RTRIM(dbo.fnobtenerDefinicionProcedimento(p.unco_emprsa, p.unco_prcdmnto, 0)))
FROM (
    SELECT DISTINCT ae0.unco_emprsa, asd0.unco_prcdmnto
    FROM tbAdmisiones a0 WITH (NOLOCK)
    JOIN tbAdmisionesEmpresas ae0 WITH (NOLOCK)
        ON ae0.unco_admsns = a0.unco
    JOIN tbAdmisionesEmpresasPuntosAtencion aep0 WITH (NOLOCK)
        ON aep0.unco_admsns_emprss = ae0.unco
    JOIN tbAdmisionesServiciosDetalle asd0 WITH (NOLOCK)
        ON asd0.unco_admsn_emprss_pnts_atncn = aep0.unco
    WHERE a0.fcha_admsn >= @fcha_inicio
      AND a0.fcha_admsn <  @fcha_tope
      AND asd0.estdo = 1
      AND asd0.psr = 1
      AND asd0.unco_prcdmnto IS NOT NULL
      AND ae0.unco_emprsa IS NOT NULL
) p;

WITH cte_det AS (
    -- Servicios / procedimientos
    SELECT
        asd.unco                            AS unco_dtlle,
        asd.unco_admsn_emprss_pnts_atncn,
        asd.fcha_ordn,
        asd.unco_prfsnls_sld_ordna          AS unco_prfsnl_ordna,
        asd.unco_prfsnls_sld_rlza           AS unco_prfsnl_rlza,
        asd.unco_prcdmnto                   AS unco_prcdmnto,
        CAST(NULL AS BIGINT)                AS unco_ctlgo_smnstrs,
        asd.unco_lna_prdcto,
        asd.cntdd,
        asd.vlr_untro,
        ISNULL(asd.vlr_hnrrs, 0)            AS vlr_hnrrs,
        asd.unco_trnsccn,
        asd.unco_estdo_rgstro,
        asd.cnsctvo_Ordn_srvc_admsn         AS cnsctvo_ordn_smntro_admsn,
        'SERVICIO'                          AS tpo_dtlle
    FROM tbAdmisionesServiciosDetalle asd WITH (NOLOCK)
    WHERE asd.estdo = 1
      AND asd.psr = 1
    UNION ALL
    -- Suministros: medicamentos y dispositivos medicos
    SELECT
        smd.unco                            AS unco_dtlle,
        smd.unco_admsn_emprss_pnts_atncn,
        smd.fcha_ordn,
        smd.unco_mdco_ordna                 AS unco_prfsnl_ordna,
        CAST(NULL AS BIGINT)                AS unco_prfsnl_rlza,
        CAST(NULL AS BIGINT)                AS unco_prcdmnto,
        smd.unco_ctlgo_smnstrs_mdcmnts      AS unco_ctlgo_smnstrs,
        smd.unco_lna_prdcto,
        smd.cntdd,
        smd.vlr_untro,
        CAST(0 AS DECIMAL(18, 3))           AS vlr_hnrrs,
        smd.unco_trnsccn,
        smd.unco_estdo_rgstro,
        smd.cnsctvo_ordn_smntro_admsn,
        'SUMINISTRO'                        AS tpo_dtlle
    FROM tbAdmisionesSuministrosDetalle smd WITH (NOLOCK)
    WHERE smd.estdo = 1
      AND smd.psr = 1
),
cte_hc_dx AS (
    -- Diagnóstico principal y relacionados desde historia clínica (tpo_dgnstco = 2),
    -- limitado a las admisiones del periodo (antes se numeraba toda la tabla de historias)
    SELECT unco_admsns, unco_dgnstco, unco_dgnstco_rlcndo1, unco_dgnstco_rlcndo2
    FROM (
        SELECT hc0.unco_admsns, hc0.unco_dgnstco, hc0.unco_dgnstco_rlcndo1, hc0.unco_dgnstco_rlcndo2,
               ROW_NUMBER() OVER (PARTITION BY hc0.unco_admsns ORDER BY hc0.unco) AS rn
        FROM tbHistoriasClinicas hc0 WITH (NOLOCK)
        WHERE hc0.tpo_dgnstco = 2
          AND hc0.unco_dgnstco IS NOT NULL
          AND EXISTS (
                SELECT 1
                FROM tbAdmisiones a1 WITH (NOLOCK)
                WHERE a1.unco = hc0.unco_admsns
                  AND a1.fcha_admsn >= @fcha_inicio
                  AND a1.fcha_admsn <  @fcha_tope
          )
    ) hc
    WHERE rn = 1
)

SELECT
    ISNULL(pra.cnsctvo_trgge, 0)                                                        AS cnsctvo_trgge,
    ISNULL(adm.cnsctvo_admsns, 0)                                                       AS cnsctvo_admsn,
    LTRIM(RTRIM(s.dscrpcn))                                                             AS sede,
    LTRIM(RTRIM(ISNULL(emp.dscrpcn_crta, '')))                                          AS emprsa,
    LTRIM(RTRIM(ISNULL(td.cdgo, '')))                                                   AS tpo_idntfccn,
    LTRIM(RTRIM(CAST(af.nmro_idntfccn AS VARCHAR(30))))                                 AS nmro_idntfccn,

    LTRIM(RTRIM(af.prmr_nmbre))                                                         AS prmr_nmbre,
    LTRIM(RTRIM(af.sgndo_nmbre))                                                        AS sgndo_nmbre,
    LTRIM(RTRIM(af.prmr_aplldo))                                                        AS prmr_aplldo,
    LTRIM(RTRIM(af.sgndo_aplldo))                                                       AS sgndo_aplldo,

    ISNULL(adm.edd, 0)                                                                  AS edd,
    LTRIM(RTRIM(COALESCE(NULLIF(LTRIM(RTRIM(af.tlfno)), ''), adm.tlfno_afldo, '')))     AS tlfno,
    CONVERT(VARCHAR(19), af.fcha_ncmnto, 120)                                           AS fcha_ncmnto,
    LTRIM(RTRIM(ISNULL(sx.cdgo, '')))                                                   AS sexo,
    LTRIM(RTRIM(ISNULL(rza.dscrpcn, '')))                                               AS rza,
    LTRIM(RTRIM(ISNULL(af.drccn, '')))                                                  AS drccn,
    LTRIM(RTRIM(ISNULL(mncpo.dscrpcn, '')))                                             AS mncpo_rsdncia,

    LTRIM(RTRIM(ISNULL(td_ordna.cdgo, '')))                                             AS tpo_idntfccn_prfsnl_ordna,
    LTRIM(RTRIM(ISNULL(CAST(ps_ordna.nmro_idntfccn AS VARCHAR(30)), '')))               AS nmro_idntfccn_prfsnl_ordna,

    LTRIM(RTRIM(CONCAT_WS(' ',
        NULLIF(LTRIM(RTRIM(ps_ordna.nmbrs)), ''),
        NULLIF(LTRIM(RTRIM(ps_ordna.apllds)), '')
    )))                                                                                 AS prfsnl_ordna,

    LTRIM(RTRIM(CONCAT_WS(' ',
        NULLIF(LTRIM(RTRIM(ps_rlza.nmbrs)), ''),
        NULLIF(LTRIM(RTRIM(ps_rlza.apllds)), '')
    )))                                                                                 AS prfsnl_rlza,

    LTRIM(RTRIM(ISNULL(dx_hc.cdgo_dgnstco, ISNULL(dx.cdgo_dgnstco, ''))))               AS cd_dx,
    LTRIM(RTRIM(ISNULL(dx_hc.dscrpcn,      ISNULL(dx.dscrpcn,      ''))))               AS dx,
    LTRIM(RTRIM(ISNULL(dx_rlcndo1.cdgo_dgnstco, '')))                                   AS cd_dx_rlcndo1,
    LTRIM(RTRIM(ISNULL(dx_rlcndo1.dscrpcn, '')))                                        AS dx_rlcndo1,
    LTRIM(RTRIM(ISNULL(dx_rlcndo2.cdgo_dgnstco, '')))                                   AS cd_dx_rlcndo2,
    LTRIM(RTRIM(ISNULL(dx_rlcndo2.dscrpcn, '')))                                        AS dx_rlcndo2,
    CONVERT(VARCHAR(19), adm.fcha_admsn, 120)                                           AS fcha_admsn,
    ISNULL(CONVERT(VARCHAR(19), adm.fcha_slda_admsn, 120), '')                          AS fcha_slda_admsn,
    ISNULL(CONVERT(VARCHAR(19), det.fcha_ordn, 120), '')                                AS fcha_ordn,
    ISNULL(CONVERT(VARCHAR(19), t.fcha_ingrso_pcnte, 120), '')                          AS fcha_atncn2,
    ISNULL(t.cnsctvo_dcto, '')                                                          AS cnsctvo_dcto,
    ISNULL(CONVERT(VARCHAR(19), t.fcha_dcto, 120), '')                                  AS fcha_dcto,
    ISNULL(det.cnsctvo_ordn_smntro_admsn, 0)                                            AS cnsctvo_ordn_smntro_admsn,

    cx.cdgo_prcdmnto                                                                    AS cdgo_prcdmnto,

    LTRIM(RTRIM(ISNULL(csm.rslcn, '')))                                                 AS rslcn,

    cx.prcdmnto                                                                         AS prcdmnto,

    LTRIM(RTRIM(ISNULL(lp.dscrpcn, '')))                                                AS lna_prdcto,
    ISNULL(CAST(det.cntdd AS INT), 0)                                                   AS cntdd,
    ISNULL(CAST(det.vlr_untro AS BIGINT), 0)                                            AS vlr_srvco,
    ISNULL(CAST(det.cntdd * det.vlr_untro AS BIGINT), 0)                                AS vlr_ttl,
    CASE WHEN det.tpo_dtlle = 'SERVICIO'   THEN ISNULL(CAST(det.cntdd * det.vlr_untro AS BIGINT), 0) ELSE 0 END AS vlr_srvcs,
    CASE WHEN det.tpo_dtlle = 'SUMINISTRO' THEN ISNULL(CAST(det.cntdd * det.vlr_untro AS BIGINT), 0) ELSE 0 END AS vlr_smnstrs,
    ISNULL(CAST(det.vlr_hnrrs AS BIGINT), 0)                                            AS vlr_hnrrio,
    ISNULL(CONVERT(VARCHAR(10), atz.fcha_atrzcn_eps, 23), '')                           AS fcha_atrzcn_eps,
    ISNULL(atz.nmro_atrzcn_eps, '')                                                     AS nmro_atrzcn_eps,
    ISNULL(LTRIM(RTRIM(era.dscrpcn)), '')                                               AS estdo_admsn,
    ISNULL(LTRIM(RTRIM(ert.dscrpcn)), '')                                               AS estdo_trnsccn,
    ISNULL(LTRIM(RTRIM(ers.dscrpcn)), '')                                               AS estdo_srvcs,
    LTRIM(RTRIM(ISNULL(lgn.dscrpcn, '')))                                               AS usro_rlza,
    LTRIM(RTRIM(ISNULL(adm.usro_mdfccn, '')))                                           AS usro_mdfccn,
    ISNULL(CAST(pra.tnsn_artrl_alta    AS INT), 0)                                      AS tnsn_artrl_alta,
    ISNULL(CAST(pra.tnsn_artrl_bja     AS INT), 0)                                      AS tnsn_artrl_bja,
    ISNULL(CAST(pra.frcnca_crdca       AS INT), 0)                                      AS frcnca_crdca,
    ISNULL(CAST(pra.frcnca_rsprtra     AS INT), 0)                                      AS frcnca_rsprtra,
    ISNULL(CAST(pra.tmprtra            AS DECIMAL(5,1)), 0)                             AS tmprtra,
    ISNULL(CAST(pra.pso                AS DECIMAL(7,2)), 0)                             AS pso,
    ISNULL(CAST(pra.tlla               AS DECIMAL(7,2)), 0)                             AS tlla,
    ISNULL(CAST(pra.imc                AS DECIMAL(7,2)), 0)                             AS imc
    , COUNT(*) OVER () AS total_registros

FROM tbAdmisiones adm WITH (NOLOCK)
JOIN tbSedesPuntosAtencion spa WITH (NOLOCK)
    ON spa.unco = adm.unco_sde_pnto_atncn
LEFT JOIN tbAfiliados af WITH (NOLOCK)
    ON af.unco = adm.unco_afldo
LEFT JOIN tbRazas rza WITH (NOLOCK)
    ON rza.unco = af.unco_rza
LEFT JOIN tbTiposDocumentos td WITH (NOLOCK)
    ON td.unco = af.unco_tpo_idntfccn
LEFT JOIN tbMunicipios mncpo WITH (NOLOCK)
    ON mncpo.unco = af.unco_mncpo
JOIN tbSedes s WITH (NOLOCK)
    ON s.unco = spa.unco_sde
JOIN tbAdmisionesEmpresas ae WITH (NOLOCK)
    ON ae.unco_admsns = adm.unco
JOIN tbEmpresas emp WITH (NOLOCK)
    ON emp.unco = ae.unco_emprsa
LEFT JOIN tbSexos sx WITH (NOLOCK)
    ON sx.unco = adm.unco_sxo
LEFT JOIN tbDiagnosticos dx WITH (NOLOCK)
    ON dx.unco = adm.unco_dgnstco_ingrso
LEFT JOIN cte_hc_dx hc_dx
    ON hc_dx.unco_admsns = adm.unco
LEFT JOIN tbDiagnosticos dx_hc WITH (NOLOCK)
    ON dx_hc.unco = hc_dx.unco_dgnstco
LEFT JOIN tbDiagnosticos dx_rlcndo1 WITH (NOLOCK)
    ON dx_rlcndo1.unco = hc_dx.unco_dgnstco_rlcndo1
LEFT JOIN tbDiagnosticos dx_rlcndo2 WITH (NOLOCK)
    ON dx_rlcndo2.unco = hc_dx.unco_dgnstco_rlcndo2
LEFT JOIN tbLogin lgn WITH (NOLOCK)
    ON lgn.unco = adm.unco_lgn_rlza
LEFT JOIN tbEstadosRegistros era WITH (NOLOCK)
    ON era.unco = adm.unco_estdo_rgstro
-- INNER: el filtro final exige un código de procedimiento/suministro no vacío, que solo existe si hay detalle
JOIN tbAdmisionesEmpresasPuntosAtencion aep WITH (NOLOCK)
    ON aep.unco_admsns_emprss = ae.unco
JOIN cte_det det
    ON det.unco_admsn_emprss_pnts_atncn = aep.unco
LEFT JOIN tbTransacciones t WITH (NOLOCK)
    ON t.unco = det.unco_trnsccn
OUTER APPLY (
    -- Autorizacion EPS del item facturado en la transaccion (mismo procedimiento o suministro)
    SELECT TOP 1 z.nmro_atrzcn_eps, z.fcha_atrzcn_eps
    FROM (
        SELECT LTRIM(RTRIM(ts.nmro_atrzcn_eps)) AS nmro_atrzcn_eps, ts.fcha_atrzcn_eps
        FROM tbTransaccionesServicios ts WITH (NOLOCK)
        WHERE det.tpo_dtlle = 'SERVICIO'
          AND ts.unco_trnsccn = det.unco_trnsccn
          AND ts.unco_prcdmnto = det.unco_prcdmnto
        UNION ALL
        SELECT LTRIM(RTRIM(tsu.nmro_atrzcn_eps)), CAST(NULL AS DATETIME)
        FROM tbTransaccionesSuministros tsu WITH (NOLOCK)
        WHERE det.tpo_dtlle = 'SUMINISTRO'
          AND tsu.unco_trnsccn = det.unco_trnsccn
          AND tsu.unco_ctlgo_smnstrs_mdcmnts = det.unco_ctlgo_smnstrs
    ) z
    ORDER BY z.fcha_atrzcn_eps DESC
) atz
LEFT JOIN tbProfesionalesSalud ps_ordna WITH (NOLOCK)
    ON ps_ordna.unco = det.unco_prfsnl_ordna
LEFT JOIN tbTiposDocumentos td_ordna WITH (NOLOCK)
    ON td_ordna.unco = ps_ordna.unco_tpo_idntfccn
LEFT JOIN tbProfesionalesSalud ps_rlza WITH (NOLOCK)
    ON ps_rlza.unco = det.unco_prfsnl_rlza
LEFT JOIN tbLineasProductos lp WITH (NOLOCK)
    ON lp.unco = det.unco_lna_prdcto
LEFT JOIN tbCatalogoSuministrosMedicamentos csm WITH (NOLOCK)
    ON csm.unco = det.unco_ctlgo_smnstrs
LEFT JOIN @def df
    ON df.unco_emprsa   = ae.unco_emprsa
   AND df.unco_prcdmnto = det.unco_prcdmnto
LEFT JOIN tbEstadosRegistros ert WITH (NOLOCK)
    ON ert.unco = t.unco_estdo_rgstro
LEFT JOIN tbEstadosRegistros ers WITH (NOLOCK)
    ON ers.unco = det.unco_estdo_rgstro
LEFT JOIN tbPreadmision pra WITH (NOLOCK)
    ON pra.unco_admsns = adm.unco
CROSS APPLY (
    -- Código y descripción calculados una sola vez por fila y reutilizados en SELECT y WHERE
    SELECT
        ISNULL(REPLACE(REPLACE(REPLACE(CASE
            WHEN det.unco_prcdmnto IS NOT NULL
                THEN df.cdgo_raw
            WHEN csm.cdgo IS NOT NULL
                THEN LTRIM(RTRIM(CAST(csm.cdgo AS VARCHAR(20))))
            ELSE ''
        END, CHAR(9), ''), CHAR(13), ''), CHAR(10), ''), '') AS cdgo_prcdmnto,
        ISNULL(REPLACE(REPLACE(REPLACE(CASE
            WHEN det.unco_prcdmnto IS NOT NULL
                THEN df.dscr_raw
            WHEN csm.dscrpcn IS NOT NULL
                THEN LTRIM(RTRIM(csm.dscrpcn))
            ELSE ''
        END, CHAR(9), ''), CHAR(13), ''), CHAR(10), ''), '') AS prcdmnto
) cx

WHERE adm.fcha_admsn >= @fcha_inicio
  AND adm.fcha_admsn <  @fcha_tope
  AND cx.cdgo_prcdmnto <> ''
  AND (:filtrar_sedes = 0 OR s.unco IN :sedes)
  AND (:filtrar_empresas = 0 OR ae.unco_emprsa IN :empresas)
  AND (:filtrar_lineas = 0 OR lp.unco IN :lineas)

ORDER BY adm.fcha_admsn, adm.cnsctvo_admsns, det.tpo_dtlle, det.unco_dtlle
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
OPTION (RECOMPILE);
"""

ADMISSIONS_EXPORT_SQL = derive_export_sql(ADMISSIONS_SQL, "Admisiones")

ADMISSIONS_QUERY = ReadOnlyQuery(
    name="statistics.admissions",
    sql=ADMISSIONS_SQL,
    list_params=frozenset({"sedes", "empresas", "lineas"}),
)

ADMISSIONS_EXPORT_QUERY = ReadOnlyQuery(
    name="statistics.admissions_export",
    sql=ADMISSIONS_EXPORT_SQL,
    list_params=frozenset({"sedes", "empresas", "lineas"}),
)
