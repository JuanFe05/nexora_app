"""Consulta Facturas Detalladas (derivada de FacturasDetalladas_V11.sql).

Cambios respecto al original, todos verificables por diff: fechas, sedes, empresas, offset y
limit llegan como parametros enlazados; `SET NOCOUNT ON`; `unco_dtlle` (solo para desempatar el
orden) y `total_registros` (COUNT(*) OVER ()); paginacion OFFSET/FETCH. Calculos, CTE, OUTER APPLY
y reglas de negocio se conservan sin cambios.
"""

import re

from nexora.integration_management.application.ports import ReadOnlyQuery

DETAILED_INVOICES_SQL = r"""
SET NOCOUNT ON;
-- PARAMETROS (enlazados por el backend): fechas inclusivas
DECLARE @fcha_inicio DATE = CAST(:fecha_inicial AS DATE);
DECLARE @fcha_fin    DATE = CAST(:fecha_final AS DATE);
DECLARE @fcha_tope   DATE = DATEADD(DAY, 1, @fcha_fin); -- límite exclusivo interno

-- Solo lectura: variable de tabla (DECLARE), sin CREATE/INSERT sobre objetos de la base.
-- Tipos BIGINT asumidos para unco_emprsa / unco_prcdmnto (ver validación de tipos en las notas).
DECLARE @def TABLE (
    unco_emprsa   BIGINT NOT NULL,
    unco_prcdmnto BIGINT NOT NULL,
    cdgo_raw      VARCHAR(255) NULL,
    dscr_raw      VARCHAR(255) NULL,
    PRIMARY KEY (unco_emprsa, unco_prcdmnto)
);

-- La función escalar se evalúa una sola vez por par DISTINCT (empresa, procedimiento) del periodo,
-- y siempre por encima del DISTINCT; antes se ejecutaba 2 veces por cada fila de detalle.
INSERT INTO @def (unco_emprsa, unco_prcdmnto, cdgo_raw, dscr_raw)
SELECT
    p.unco_emprsa,
    p.unco_prcdmnto,
    LTRIM(RTRIM(CAST(dbo.fnobtenerDefinicionProcedimento(p.unco_emprsa, p.unco_prcdmnto, 1) AS VARCHAR(255)))),
    LTRIM(RTRIM(CAST(dbo.fnobtenerDefinicionProcedimento(p.unco_emprsa, p.unco_prcdmnto, 0) AS VARCHAR(255))))
FROM (
    SELECT DISTINCT ae.unco_emprsa, ts.unco_prcdmnto
    FROM (
        SELECT t0.unco AS unco_trnsccn
        FROM tbTransacciones t0 WITH (NOLOCK)
        WHERE t0.fcha_dcto >= @fcha_inicio
          AND t0.fcha_dcto <  @fcha_tope
        UNION
        SELECT tfa0.unco_trnsccn
        FROM tbFacturasAgrupadas fa0 WITH (NOLOCK)
        JOIN tbTransaccionesFacturasAgrupadas tfa0 WITH (NOLOCK)
            ON tfa0.unco_fctra_agrpda = fa0.unco
        WHERE fa0.fcha_dcto >= @fcha_inicio
          AND fa0.fcha_dcto <  @fcha_tope
    ) dx
    JOIN tbTransacciones t WITH (NOLOCK)
        ON t.unco = dx.unco_trnsccn
    JOIN tbAfiliadosEmpresas ae WITH (NOLOCK)
        ON ae.unco = t.Unco_afldo_emprsa
    JOIN tbTransaccionesServicios ts WITH (NOLOCK)
        ON ts.unco_trnsccn = t.unco
    WHERE ts.unco_prcdmnto IS NOT NULL
      AND ae.unco_emprsa IS NOT NULL
      AND (:filtrar_empresas = 0 OR ae.unco_emprsa IN :empresas)
      AND (:filtrar_sedes = 0 OR EXISTS (
            SELECT 1 FROM tbSedesPuntosAtencion spa0 WITH (NOLOCK)
            WHERE spa0.unco = t.Unco_sde_pnto_atncn AND spa0.unco_sde IN :sedes))
) p;

WITH cte_doc AS (
    -- Documentos del periodo: transacciones directas (T) y facturas agrupadas (F)
    SELECT
        CAST('T' AS CHAR(1))  AS tpo,
        t.unco                AS unco_trnsccn,
        t.cnsctvo_dcto        AS cnsctvo_dcto,
        t.fcha_dcto           AS fcha_dcto,
        t.usro_mdfccn         AS usro_mdfccn,
        t.unco_lgn_rlza       AS unco_lgn_rlza,
        t.unco_estdo_rgstro   AS unco_estdo_rgstro,
        t.unco_dcto_rfrnca    AS unco_dcto_rfrnca,
        CAST(t.tpo_dcto AS VARCHAR(10)) AS tpo_dcto,
        t.unco_cnsldcn_rps    AS unco_cnsldcn_rps,
        -- Misma regla de dbo.fnObtenerNumTransacciondeTurno: 'T' usa prfjo_trnsscn; el resto usa prfjo
        NULLIF(LTRIM(RTRIM(CASE WHEN t.tpo_dcto = 'T' THEN pl.prfjo_trnsscn ELSE pl.prfjo END)), '') AS prfjo_dcto
    FROM tbTransacciones t WITH (NOLOCK)
    LEFT JOIN tbParametrosLey pl WITH (NOLOCK)
        ON pl.unco = t.Unco_prmts_ley
    WHERE t.fcha_dcto >= @fcha_inicio
      AND t.fcha_dcto <  @fcha_tope
    UNION ALL
    SELECT
        'F',
        tfa.unco_trnsccn,
        fa.cnsctvo_fctrcn,
        fa.fcha_dcto,
        fa.usro_mdfccn,
        fa.unco_lgn_rlza,
        fa.unco_estdo_rgstro,
        CAST(NULL AS BIGINT),
        CAST('AGR' AS VARCHAR(10)),
        fa.unco_cnsldcn_rps,
        NULLIF(LTRIM(RTRIM(pl.prfjo)), '')
    FROM tbFacturasAgrupadas fa WITH (NOLOCK)
    JOIN tbTransaccionesFacturasAgrupadas tfa WITH (NOLOCK)
        ON tfa.unco_fctra_agrpda = fa.unco
    LEFT JOIN tbParametrosLey pl WITH (NOLOCK)
        ON pl.unco = fa.Unco_prmts_ley
    WHERE fa.fcha_dcto >= @fcha_inicio
      AND fa.fcha_dcto <  @fcha_tope
),
cte_doc_x AS (
    -- Datos agregados por transaccion: se resuelven una sola vez por documento (no por fila de detalle)
    SELECT
        doc.*,
        adm.cnsctvo_admsns,
        adm.fcha_slda_admsn,
        pg.frma_pgo,
        pg.vlr_frma_pgo_dtlle,
        pg.vlr_ttl_frmas_pgo,
        pg.vlr_frmas_pgo_tpo1,
        pg.vlr_frmas_pgo_tpo2,
        pg.vlr_frmas_pgo_otro_tpo,
        liq.tpo_lqdcn_pcnte,
        liq.vlr_lqdd_pcnte,
        -- Estado del pago: lo liquidado al paciente (vlr_pgo) vs. lo realmente recibido (tpo 1) y descuentos/creditos (tpo 2)
        CASE WHEN ISNULL(liq.vlr_lqdd_pcnte, 0) <= 0                       THEN ''
             WHEN pg.vlr_ttl_frmas_pgo IS NULL                             THEN 'SIN FORMA DE PAGO'
             WHEN ISNULL(pg.vlr_frmas_pgo_tpo1, 0) >= liq.vlr_lqdd_pcnte   THEN 'PAGADO'
             WHEN ISNULL(pg.vlr_frmas_pgo_tpo1, 0) > 0
              AND ISNULL(pg.vlr_frmas_pgo_tpo2, 0) > 0                     THEN 'PAGO PARCIAL CON DESCUENTO'
             WHEN ISNULL(pg.vlr_frmas_pgo_tpo1, 0) > 0                     THEN 'PAGO PARCIAL'
             ELSE 'SIN PAGO (SOLO DESCUENTO/CREDITO)' END                  AS estdo_pgo_pcnte,
        fagr.cnsctvo_fctrcn,
        rmsn.no_remision,
        rmsn.fcha_rmsn,
        rmsn.unco_cnta_cbro,
        rmsn.cnsctvo_cta_cbro
    FROM cte_doc doc
    OUTER APPLY (
        -- Admision por transaccion (servicios o suministros de admision)
        SELECT MAX(z.cnsctvo_admsns) AS cnsctvo_admsns, MAX(z.fcha_slda_admsn) AS fcha_slda_admsn
        FROM (
            SELECT a.cnsctvo_admsns, a.fcha_slda_admsn
            FROM tbAdmisionesServiciosDetalle asd WITH (NOLOCK)
            JOIN tbAdmisionesEmpresasPuntosAtencion aep WITH (NOLOCK) ON aep.unco = asd.unco_admsn_emprss_pnts_atncn
            JOIN tbAdmisionesEmpresas ae_adm WITH (NOLOCK)            ON ae_adm.unco = aep.unco_admsns_emprss
            JOIN tbAdmisiones a WITH (NOLOCK)                         ON a.unco = ae_adm.unco_admsns
            WHERE asd.unco_trnsccn = doc.unco_trnsccn
            UNION ALL
            SELECT a.cnsctvo_admsns, a.fcha_slda_admsn
            FROM tbAdmisionesSuministrosDetalle smd WITH (NOLOCK)
            JOIN tbAdmisionesEmpresasPuntosAtencion aep WITH (NOLOCK) ON aep.unco = smd.unco_admsn_emprss_pnts_atncn
            JOIN tbAdmisionesEmpresas ae_adm WITH (NOLOCK)            ON ae_adm.unco = aep.unco_admsns_emprss
            JOIN tbAdmisiones a WITH (NOLOCK)                         ON a.unco = ae_adm.unco_admsns
            WHERE smd.unco_trnsccn = doc.unco_trnsccn
        ) z
    ) adm
    OUTER APPLY (
        -- Formas de pago por transaccion. frma_pgo y vlr_frma_pgo_dtlle se concatenan con el mismo ORDER BY (tfp.unco),
        -- de modo que el n-esimo valor corresponde a la n-esima forma de pago. Un valor NULL queda en blanco (conserva la posicion).
        -- Los totales numericos se separan por fp.tpo (clasificacion de origen en tbFormasPago); no se reclasifica nada.
        SELECT
            STRING_AGG(CAST(ISNULL(LTRIM(RTRIM(fp.dscrpcn)), 'SIN FORMA DE PAGO') AS VARCHAR(MAX)), ', ')
                WITHIN GROUP (ORDER BY tfp.unco)                                         AS frma_pgo,
            STRING_AGG(CAST(ISNULL(CONVERT(VARCHAR(30), tfp.vlr), '') AS VARCHAR(MAX)), ', ')
                WITHIN GROUP (ORDER BY tfp.unco)                                         AS vlr_frma_pgo_dtlle,
            SUM(tfp.vlr)                                                                 AS vlr_ttl_frmas_pgo,
            SUM(CASE WHEN fp.tpo = 1 THEN tfp.vlr END)                                   AS vlr_frmas_pgo_tpo1,
            SUM(CASE WHEN fp.tpo = 2 THEN tfp.vlr END)                                   AS vlr_frmas_pgo_tpo2,
            SUM(CASE WHEN fp.tpo IS NULL OR fp.tpo NOT IN (1, 2) THEN tfp.vlr END)       AS vlr_frmas_pgo_otro_tpo
        FROM tbTransaccionesFormasPago tfp WITH (NOLOCK)
        LEFT JOIN tbEmpresasFormasPago efp WITH (NOLOCK) ON efp.unco = tfp.unco_emprss_frma_pgs
        LEFT JOIN tbFormasPago fp WITH (NOLOCK)          ON fp.Unco  = efp.unco_frms_pgo
        WHERE tfp.unco_trnsccn = doc.unco_trnsccn
    ) pg
    OUTER APPLY (
        -- Valor liquidado a cargo del paciente (origen tbTransacciones). NO es lo pagado: incluye descuentos (fp.tpo = 2).
        -- Copago y cuota moderadora son excluyentes salvo 6 casos de origen con el mismo importe en ambos (no se suman).
        SELECT
            CASE WHEN ISNULL(tr.vlr_cpgo, 0) > 0 AND ISNULL(tr.vlr_cta_mdrdra, 0) > 0 THEN 'COPAGO Y CUOTA MODERADORA'
                 WHEN ISNULL(tr.vlr_cpgo, 0) > 0                                       THEN 'COPAGO'
                 WHEN ISNULL(tr.vlr_cta_mdrdra, 0) > 0                                 THEN 'CUOTA MODERADORA'
                 WHEN ISNULL(tr.vlr_pgo, 0) > 0                                        THEN 'SIN CLASIFICAR'
                 ELSE '' END                                                           AS tpo_lqdcn_pcnte,
            tr.vlr_pgo                                                                 AS vlr_lqdd_pcnte
        FROM tbTransacciones tr WITH (NOLOCK)
        WHERE tr.unco = doc.unco_trnsccn
    ) liq
    OUTER APPLY (
        -- Factura agrupada asociada a la transaccion directa
        SELECT MAX(fa.cnsctvo_fctrcn) AS cnsctvo_fctrcn, MAX(fa.unco_cnsldcn_rps) AS unco_cnsldcn_rps
        FROM tbTransaccionesFacturasAgrupadas tfa WITH (NOLOCK)
        JOIN tbFacturasAgrupadas fa WITH (NOLOCK) ON fa.unco = tfa.unco_fctra_agrpda
        WHERE tfa.unco_trnsccn = doc.unco_trnsccn
          AND doc.tpo = 'T'
    ) fagr
    OUTER APPLY (
        -- Remision RIPS (consolidacion) y cuenta de cobro de la factura agrupada
        SELECT cr.unco AS no_remision, cr.fcha_rmsn, cr.unco_cnta_cbro, cc.cnsctvo_cta_cbro
        FROM tbConsolidacionRIPS cr WITH (NOLOCK)
        LEFT JOIN tbCuentaCobro cc WITH (NOLOCK) ON cc.unco = cr.unco_cnta_cbro
        WHERE cr.unco = COALESCE(doc.unco_cnsldcn_rps, fagr.unco_cnsldcn_rps)
    ) rmsn
)

SELECT
    LTRIM(RTRIM(s.dscrpcn))                                                AS sede,
    LTRIM(RTRIM(ISNULL(t.dscrpcn_emprsa_crta, '')))                        AS emprs,
    LTRIM(RTRIM(pa.dscrpcn))                                               AS pnto_atncn,
    LTRIM(RTRIM(pa.dscrpcn))                                               AS pnto_atncn_atncn,
    CASE WHEN doc.tpo = 'F' THEN 'FACTURA AGRUPADA'
         ELSE LTRIM(RTRIM(ISNULL(dr.dscrpcn, ''))) END                     AS dscrp_transcn,
    doc.tpo_dcto                                                           AS tpo_dcto,
    doc.prfjo_dcto                                                         AS prfjo_dcto,
    CASE WHEN doc.prfjo_dcto IS NULL THEN CAST(doc.cnsctvo_dcto AS VARCHAR(20))
         ELSE doc.prfjo_dcto + '-' + CAST(doc.cnsctvo_dcto AS VARCHAR(20)) END AS nmro_dcto,
    doc.cnsctvo_dcto                                                       AS cnsctvo_dcto,
    ISNULL(CONVERT(VARCHAR(20), doc.no_remision), '')                      AS no_remision,
    ISNULL(CONVERT(VARCHAR(19), doc.fcha_rmsn, 120), '')                   AS fcha_rmsn,
    ISNULL(CONVERT(VARCHAR(20), doc.unco_cnta_cbro), '')                   AS unco_cnta_cbro,
    ISNULL(CONVERT(VARCHAR(20), doc.cnsctvo_cta_cbro), '')                 AS no_envio,
    CASE WHEN doc.tpo = 'T' THEN ISNULL(doc.cnsctvo_fctrcn, 0) ELSE 0 END  AS cnsctvo_fctra_agrpda,
    ISNULL(doc.cnsctvo_admsns, 0)                                          AS admision,
    CONVERT(VARCHAR(10), doc.fcha_dcto, 23)                                AS fcha_dcto,
    ISNULL(CONVERT(VARCHAR(10), t.fcha_ingrso_pcnte, 23), '')              AS fcha_ingrso_pcnte,
    ISNULL(CONVERT(VARCHAR(10), COALESCE(t.fcha_egrso_pcnte, doc.fcha_slda_admsn), 23), '') AS fcha_egreso,
    ISNULL(LTRIM(RTRIM(er.dscrpcn)), '')                                   AS estado,
    LTRIM(RTRIM(ISNULL(td.cdgo, '')))                                      AS cdgo_tpo_dcmnto,
    ISNULL(t.nmro_idntfccn, '')                                            AS cc_afldo,
    LTRIM(RTRIM(ISNULL(t.prmr_nmbre,  '')))                                AS prmr_nmbre,
    LTRIM(RTRIM(ISNULL(t.sgndo_nmbre, '')))                                AS sgndo_nmbre,
    LTRIM(RTRIM(ISNULL(t.prmr_aplldo, '')))                                AS prmr_aplldo,
    LTRIM(RTRIM(ISNULL(t.sgndo_aplldo,'')))                                AS sgndo_aplldo,
    ISNULL(t.edd, '')                                                      AS edd,
    LTRIM(RTRIM(ISNULL(sx.cdgo, '')))                                      AS genero,
    ISNULL(t.tlfno_afldo, '')                                              AS tlfno_afldo,
    ISNULL(CONVERT(VARCHAR(10), afl.fcha_ncmnto, 23), '')                  AS fcha_ncmnto,
    LTRIM(RTRIM(ISNULL(afl.drccn, '')))                                    AS drccn,
    LTRIM(RTRIM(ISNULL(mncpo.dscrpcn, '')))                                AS mncpo_rsdncia,

    ISNULL(thc.tnsn_artrl_alta,  0)                                        AS tnsn_artrl_alta,
    ISNULL(thc.tnsn_artrl_bja,   0)                                        AS tnsn_artrl_bja,
    ISNULL(thc.frcnca_crdca,     0)                                        AS frcnca_crdca,
    ISNULL(thc.frcnca_rsprtra,   0)                                        AS frcnca_rsprtra,
    ISNULL(thc.tmprtra,          0)                                        AS tmprtra,
    ISNULL(thc.pso,              0)                                        AS pso,
    ISNULL(thc.tlla,             0)                                        AS tlla,
    ISNULL(thc.imc,              0)                                        AS imc,

    LTRIM(RTRIM(
        REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(
                LTRIM(RTRIM(ISNULL(ps_ordn.nmbrs, ''))) + ' ' +
                LTRIM(RTRIM(ISNULL(ps_ordn.apllds,''))),
            CHAR(9), ' '),
            CHAR(13), ' '),
            CHAR(10), ' '),
        '  ', ' '),
    '  ', ' ')
    ))                                                                     AS prfsnl_salud_ordn,
    LTRIM(RTRIM(
        REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(
                LTRIM(RTRIM(ISNULL(ps_rlza.nmbrs, ''))) + ' ' +
                LTRIM(RTRIM(ISNULL(ps_rlza.apllds,''))),
            CHAR(9), ' '),
            CHAR(13), ' '),
            CHAR(10), ' '),
        '  ', ' '),
    '  ', ' ')
    ))                                                                     AS prfsnl_salud_rlza,

    LTRIM(RTRIM(ISNULL(dg1.cdgo_dgnstco, '')))                             AS cdgo_dgnstco,
    LTRIM(RTRIM(ISNULL(dg1.dscrpcn, '')))                                  AS dscrpcn_dgnstco,
    LTRIM(RTRIM(ISNULL(dg2.cdgo_dgnstco, '')))                             AS cdgo_dgnstco_rlcndo1,
    LTRIM(RTRIM(ISNULL(dg2.dscrpcn, '')))                                  AS dscrpcn_dgnstco_rlcndo1,
    LTRIM(RTRIM(ISNULL(dg3.cdgo_dgnstco, '')))                             AS cdgo_dgnstco_rlcndo2,
    LTRIM(RTRIM(ISNULL(dg3.dscrpcn, '')))                                  AS dscrpcn_dgnstco_rlcndo2,

    LTRIM(RTRIM(ISNULL(lp.dscrpcn, '')))                                   AS lna_prdcto,
    REPLACE(REPLACE(REPLACE(ISNULL(d.cdgo_raw, ''), CHAR(9), ''), CHAR(13), ''), CHAR(10), '') AS cdgo_prcdmnto,
    d.rslcn                                                                AS rslcn,
    REPLACE(REPLACE(REPLACE(ISNULL(d.dscr_raw, ''), CHAR(9), ''), CHAR(13), ''), CHAR(10), '') AS procedimiento,
    CASE WHEN d.tpo_dtlle = 'SERVICIO'   THEN CAST(d.cntdd * d.vlr_untro AS BIGINT) ELSE 0 END AS vlr_srvcs,
    CASE WHEN d.tpo_dtlle = 'SUMINISTRO' THEN CAST(d.cntdd * d.vlr_untro AS BIGINT) ELSE 0 END AS vlr_smnstrs,
    CAST(d.cntdd AS INT)                                                   AS cntdd,
    CAST(d.vlr_untro AS BIGINT)                                            AS vlr_untro,
    CAST(d.cntdd * d.vlr_untro AS BIGINT)                                  AS cntdd1,
    ISNULL(CAST(d.vlr_cnvno AS BIGINT), 0)                                 AS vlr_cnvno,
    CAST(d.cntdd * d.vlr_untro AS BIGINT)                                  AS vlr_factrdo,
    LTRIM(RTRIM(ISNULL(lgn.dscrpcn, '')))                                  AS usrio_realiza,
    LTRIM(RTRIM(ISNULL(doc.usro_mdfccn, '')))                              AS usrio_mdfca,
    -- Pago del paciente: liquidado (vlr_pgo de origen, incluye descuentos) vs. recibido (tpo 1) vs. descuento/credito (tpo 2)
    ISNULL(doc.tpo_lqdcn_pcnte, '')                                        AS tpo_lqdcn_pcnte,
    CASE WHEN ISNULL(doc.vlr_lqdd_pcnte, 0) > 0 THEN CONVERT(VARCHAR(30), doc.vlr_lqdd_pcnte) ELSE '' END AS vlr_lqdd_pcnte,
    ISNULL(doc.estdo_pgo_pcnte, '')                                        AS estdo_pgo_pcnte,
    ISNULL(doc.frma_pgo, '')                                               AS frma_pgo,
    ISNULL(doc.vlr_frma_pgo_dtlle, '')                                     AS vlr_frma_pgo_dtlle,
    ISNULL(CONVERT(VARCHAR(30), doc.vlr_ttl_frmas_pgo), '')                AS vlr_ttl_frmas_pgo,
    ISNULL(CONVERT(VARCHAR(30), doc.vlr_frmas_pgo_tpo1), '')               AS vlr_frmas_pgo_tpo1,
    ISNULL(CONVERT(VARCHAR(30), doc.vlr_frmas_pgo_tpo2), '')               AS vlr_frmas_pgo_tpo2,
    ISNULL(CONVERT(VARCHAR(30), doc.vlr_frmas_pgo_otro_tpo), '')           AS vlr_frmas_pgo_otro_tpo,
    ISNULL(CONVERT(VARCHAR(10), d.fcha_atrzcn_eps, 23), '')                AS fcha_atrzcn_eps,
    ISNULL(d.nmro_atrzcn_eps, '')                                          AS nmro_atrzcn_eps,
    COUNT(*) OVER ()                                                       AS total_registros

FROM cte_doc_x doc
JOIN tbTransacciones t WITH (NOLOCK)
    ON t.unco = doc.unco_trnsccn
JOIN tbAfiliadosEmpresas ae WITH (NOLOCK)
    ON ae.unco = t.Unco_afldo_emprsa
CROSS APPLY (
    -- Detalle (servicios y suministros) de la transaccion; código y descripción vienen precalculados en @def
    SELECT x.*
    FROM (
        SELECT
            ts.unco                           AS unco_dtlle,
            ts.cntdd,
            ts.vlr_untro,
            ts.vlr_cnvno,
            LTRIM(RTRIM(ts.nmro_atrzcn_eps))  AS nmro_atrzcn_eps,
            ts.fcha_atrzcn_eps,
            ts.unco_lna_prdcto,
            ts.unco_prfsnls_sld_ordna,
            ts.unco_prfsnls_sld_rlza,
            'SERVICIO'                        AS tpo_dtlle,
            CAST('' AS VARCHAR(255))          AS rslcn,
            CASE WHEN ts.unco_prcdmnto IS NULL THEN CAST('' AS VARCHAR(255)) ELSE df.cdgo_raw END AS cdgo_raw,
            CASE WHEN ts.unco_prcdmnto IS NULL THEN CAST('' AS VARCHAR(255)) ELSE df.dscr_raw END AS dscr_raw
        FROM tbTransaccionesServicios ts WITH (NOLOCK)
        LEFT JOIN @def df
            ON df.unco_emprsa   = ae.unco_emprsa
           AND df.unco_prcdmnto = ts.unco_prcdmnto
        WHERE ts.unco_trnsccn = doc.unco_trnsccn
        UNION ALL
        SELECT
            tsu.unco,
            tsu.cntdd,
            tsu.vlr_untro,
            CAST(NULL AS DECIMAL(18,2)),
            LTRIM(RTRIM(tsu.nmro_atrzcn_eps)),
            CAST(NULL AS DATETIME),
            tsu.unco_lna_prdcto,
            tsu.unco_prfsnls_sld_ordna,
            CAST(NULL AS BIGINT),
            'SUMINISTRO',
            LTRIM(RTRIM(ISNULL(cat.rslcn, ''))),
            LTRIM(RTRIM(ISNULL(cat.cdgo, ''))),
            LTRIM(RTRIM(ISNULL(cat.dscrpcn, '')))
        FROM tbTransaccionesSuministros tsu WITH (NOLOCK)
        LEFT JOIN tbCatalogoSuministrosMedicamentos cat WITH (NOLOCK)
            ON cat.unco = tsu.unco_ctlgo_smnstrs_mdcmnts
        WHERE tsu.unco_trnsccn = doc.unco_trnsccn
    ) x
) d
JOIN tbSedesPuntosAtencion spa WITH (NOLOCK)
    ON spa.unco = t.Unco_sde_pnto_atncn
JOIN tbSedes s WITH (NOLOCK)
    ON s.unco = spa.unco_sde
JOIN tbPuntosAtencion pa WITH (NOLOCK)
    ON pa.unco = spa.unco_pnto_atncn
LEFT JOIN tbAfiliados afl WITH (NOLOCK)
    ON afl.unco = ae.unco_afldo
LEFT JOIN tbMunicipios mncpo WITH (NOLOCK)
    ON mncpo.unco = afl.unco_mncpo
JOIN tbLogin lgn WITH (NOLOCK)
    ON lgn.unco = doc.unco_lgn_rlza
LEFT JOIN tbDocumentoReferencia dr WITH (NOLOCK)
    ON dr.unco = doc.unco_dcto_rfrnca
LEFT JOIN tbTiposDocumentos td WITH (NOLOCK)
    ON td.unco = t.unco_tpo_idntfccn
LEFT JOIN tbLineasProductos lp WITH (NOLOCK)
    ON lp.unco = d.unco_lna_prdcto
LEFT JOIN tbSexos sx WITH (NOLOCK)
    ON sx.unco = t.unco_sxo
LEFT JOIN tbProfesionalesSalud ps_ordn WITH (NOLOCK)
    ON ps_ordn.unco = d.unco_prfsnls_sld_ordna
LEFT JOIN tbProfesionalesSalud ps_rlza WITH (NOLOCK)
    ON ps_rlza.unco = d.unco_prfsnls_sld_rlza
LEFT JOIN tbEstadosRegistros er WITH (NOLOCK)
    ON er.Unco = doc.unco_estdo_rgstro
LEFT JOIN tbHistoriasClinicas thc WITH (NOLOCK)
    ON thc.unco_trnsccn = doc.unco_trnsccn
LEFT JOIN tbDiagnosticos dg1 WITH (NOLOCK)
    ON dg1.unco = thc.unco_dgnstco
LEFT JOIN tbDiagnosticos dg2 WITH (NOLOCK)
    ON dg2.unco = thc.unco_dgnstco_rlcndo1
LEFT JOIN tbDiagnosticos dg3 WITH (NOLOCK)
    ON dg3.unco = thc.unco_dgnstco_rlcndo2
WHERE REPLACE(REPLACE(REPLACE(ISNULL(d.cdgo_raw, ''), CHAR(9), ''), CHAR(13), ''), CHAR(10), '') NOT IN ('2', '3')
  AND (:filtrar_sedes = 0 OR s.unco IN :sedes)
  AND (:filtrar_empresas = 0 OR ae.unco_emprsa IN :empresas)
ORDER BY doc.fcha_dcto, doc.prfjo_dcto, doc.cnsctvo_dcto, doc.tpo, doc.unco_trnsccn, d.tpo_dtlle, d.unco_dtlle
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
OPTION (RECOMPILE);
"""

# Exportacion: la misma consulta y el mismo orden, sin paginacion y sin el COUNT(*) OVER () (que
# obliga a materializar todo el conjunto solo para contar). Se deriva del SQL paginado para que
# ambas consultas no puedan divergir.
_PAGING = "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY\n"
_TOTAL_COLUMN = re.compile(r",\s*COUNT\(\*\) OVER \(\)\s+AS total_registros")
_export_sql = _TOTAL_COLUMN.sub("", DETAILED_INVOICES_SQL).replace(_PAGING, "")
if (
    _export_sql == DETAILED_INVOICES_SQL
    or "OFFSET" in _export_sql
    or "total_registros" in _export_sql
):
    raise RuntimeError("No se pudo derivar la consulta de exportacion de Facturas Detalladas")
DETAILED_INVOICES_EXPORT_SQL = _export_sql

DETAILED_INVOICES_QUERY = ReadOnlyQuery(
    name="statistics.detailed_invoices",
    sql=DETAILED_INVOICES_SQL,
    list_params=frozenset({"sedes", "empresas"}),
)

DETAILED_INVOICES_EXPORT_QUERY = ReadOnlyQuery(
    name="statistics.detailed_invoices_export",
    sql=DETAILED_INVOICES_EXPORT_SQL,
    list_params=frozenset({"sedes", "empresas"}),
)
