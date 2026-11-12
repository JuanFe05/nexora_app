"""Signos Vitales, derivada de Signos_Vitales.sql e incluida en el paquete.

Diff respecto al original: SET NOCOUNT ON; fechas enlazadas; filtros de sede,
empresa y linea en el WHERE final; COUNT(*) OVER (); desempate thc.unco y
OFFSET/FETCH. Las 36 columnas, calculos, joins y reglas originales se conservan.
La exportacion se deriva del SQL paginado con el mecanismo compartido.
"""

# ruff: noqa: E501 -- SQL original conservado para permitir auditoria por diff.
from nexora.integration_management.application.ports import ReadOnlyQuery
from nexora.statistics.infrastructure.queries.export_sql import derive_export_sql

VITAL_SIGNS_SQL = r"""
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- PARAMETROS: cambiar fechas (ambas inclusivas)
DECLARE @fcha_inicio DATE = CAST(:fecha_inicial AS DATE);
DECLARE @fcha_fin    DATE = CAST(:fecha_final AS DATE);
DECLARE @fcha_tope   DATE = DATEADD(DAY, 1, @fcha_fin); -- límite exclusivo interno

-- Solo lectura: variables de tabla (DECLARE) en lugar de #temp / CREATE INDEX / DROP.
-- Tipos BIGINT asumidos para las columnas unco_* (ver validación de tipos en las notas).
DECLARE @cerrado TABLE (Unco BIGINT NOT NULL PRIMARY KEY);
DECLARE @def     TABLE (unco_emprsa BIGINT NOT NULL, unco_prcdmnto BIGINT NOT NULL, definicion VARCHAR(255) NULL,
                        PRIMARY KEY (unco_emprsa, unco_prcdmnto));
DECLARE @esp     TABLE (unco_prfsnls_sld BIGINT NOT NULL PRIMARY KEY, unco_espcldd BIGINT NULL);

-- Estados 'CERRADO' resueltos una sola vez
INSERT INTO @cerrado (Unco)
SELECT er.Unco
FROM tbEstadosRegistros er
WHERE er.Unco IS NOT NULL
  AND UPPER(LTRIM(RTRIM(ISNULL(er.dscrpcn, '')))) = 'CERRADO';

-- La función escalar se evalúa solo sobre los pares DISTINCT (empresa, procedimiento), siempre por encima del DISTINCT
INSERT INTO @def (unco_emprsa, unco_prcdmnto, definicion)
SELECT
    p.unco_emprsa,
    p.unco_prcdmnto,
    UPPER(LTRIM(RTRIM(ISNULL(
        CAST(dbo.fnobtenerDefinicionProcedimento(p.unco_emprsa, p.unco_prcdmnto, 0) AS VARCHAR(255)), ''))))
FROM (
    SELECT DISTINCT ae.unco_emprsa, ts.unco_prcdmnto
    FROM tbHistoriasClinicas thc
    JOIN @cerrado c_hc ON c_hc.Unco = thc.unco_estdo_rgstro
    JOIN tbTransacciones t ON t.unco = thc.unco_trnsccn
    JOIN @cerrado c_t ON c_t.Unco = t.unco_estdo_rgstro
    JOIN tbTransaccionesServicios ts ON ts.unco_trnsccn = t.unco
    JOIN tbAfiliadosEmpresas ae ON ae.unco = COALESCE(t.Unco_afldo_emprsa, thc.Unco_afldo_emprsa)
    WHERE thc.fcha_atncn >= @fcha_inicio
      AND thc.fcha_atncn <  @fcha_tope
      AND ts.unco_prcdmnto IS NOT NULL
      AND ae.unco_emprsa IS NOT NULL
) p;

-- Especialidad activa más reciente por profesional, calculada una sola vez (reemplaza el OUTER APPLY TOP 1 por fila)
INSERT INTO @esp (unco_prfsnls_sld, unco_espcldd)
SELECT x.unco_prfsnls_sld, x.unco_espcldd
FROM (
    SELECT pse.unco_prfsnls_sld,
           pse.unco_espcldd,
           ROW_NUMBER() OVER (PARTITION BY pse.unco_prfsnls_sld ORDER BY pse.unco DESC) AS rn
    FROM tbProfesionalesSaludEspec pse
    WHERE pse.estdo = 1
      AND pse.unco_prfsnls_sld IS NOT NULL
) x
WHERE x.rn = 1;

SELECT
    LTRIM(RTRIM(s.dscrpcn))                                        AS sede,
    LTRIM(RTRIM(ISNULL(lp.dscrpcn, '')))                            AS linea_servicio,
    LTRIM(RTRIM(ISNULL(td.cdgo, '')))                               AS tipo_documento,
    ISNULL(COALESCE(t.nmro_idntfccn, afl.nmro_idntfccn), '')        AS nmro_idntfccn,
    LTRIM(RTRIM(ISNULL(COALESCE(t.dscrpcn_emprsa_crta, adm_e.dscrpcn_emprsa), ''))) AS empresa,
    LTRIM(RTRIM(COALESCE(ta_t.dscrpcn_emprsa, rgm.dscrpcn_emprsa, '')))    AS emprsa_rgmen,
    LTRIM(RTRIM(COALESCE(ta_t.rgmen, rgm.rgmen, '')))                      AS rgmen,
    LTRIM(RTRIM(ISNULL(sx.cdgo, '')))                               AS gener,
    LTRIM(RTRIM(ISNULL(COALESCE(t.prmr_nmbre,  afl.prmr_nmbre),  ''))) AS prmr_nmbre,
    LTRIM(RTRIM(ISNULL(COALESCE(t.sgndo_nmbre, afl.sgndo_nmbre), ''))) AS sgndo_nmbre,
    LTRIM(RTRIM(ISNULL(COALESCE(t.prmr_aplldo, afl.prmr_aplldo), ''))) AS prmr_aplldo,
    LTRIM(RTRIM(ISNULL(COALESCE(t.sgndo_aplldo,afl.sgndo_aplldo),''))) AS sgndo_aplldo,
    ISNULL(CONVERT(VARCHAR(10), afl.fcha_ncmnto, 23), '')           AS fcha_ncmnto,
    ISNULL(CONVERT(VARCHAR(10), thc.fcha_atncn,  23), '')           AS fcha_atncn,
    CASE WHEN ed.anios  >= 1 THEN ed.anios
         WHEN ed.meses  >= 1 THEN ed.meses
         ELSE ed.dias END                                           AS edad,
    CASE WHEN ed.dias IS NULL THEN ''
         WHEN ed.anios >= 1 THEN N'Años'
         WHEN ed.meses >= 1 THEN N'Meses'
         ELSE N'Días' END                                           AS tipo_edad,
    LTRIM(RTRIM(ISNULL(afl.drccn, '')))                             AS direccion,
    LTRIM(RTRIM(ISNULL(mncpo.dscrpcn, '')))                         AS mncpo_rsdncia,
    ISNULL(COALESCE(t.tlfno_afldo, adm.tlfno_afldo), '')            AS teléfono,
    ISNULL(thc.tnsn_artrl_alta, 0)                                  AS tnsn_artrl_alta,
    ISNULL(thc.tnsn_artrl_bja,  0)                                  AS tnsn_artrl_bja,
    ISNULL(thc.frcnca_crdca,    0)                                  AS frcnca_crdca,
    ISNULL(thc.frcnca_rsprtra,  0)                                  AS frcnca_rsprtra,
    ISNULL(thc.tmprtra,         0)                                  AS tmprtra,
    ISNULL(thc.pso,             0)                                  AS pso,
    ISNULL(thc.tlla,            0)                                  AS tlla,
    ISNULL(thc.imc,             0)                                  AS imc,
    ISNULL(thc.prmtro_crnl,     0)                                  AS prmtro_crnl,
    LTRIM(RTRIM(ISNULL(dg1.cdgo_dgnstco, '')))                      AS cdgo_dgnstco,
    LTRIM(RTRIM(ISNULL(dg1.dscrpcn, '')))                           AS diagnostico,
    LTRIM(RTRIM(ISNULL(dg2.cdgo_dgnstco, '')))                      AS cdgo_dgnstco_rl_1,
    LTRIM(RTRIM(ISNULL(dg2.dscrpcn, '')))                           AS diagnostico_rl_1,
    LTRIM(RTRIM(ISNULL(dg3.cdgo_dgnstco, '')))                      AS cdgo_dgnstco_rl_2,
    LTRIM(RTRIM(ISNULL(dg3.dscrpcn, '')))                           AS diagnostico_rl_2,
    LTRIM(RTRIM(
        ISNULL(CONCAT_WS(' ',
            NULLIF(LTRIM(RTRIM(ps_rlza.nmbrs)), ''),
            NULLIF(LTRIM(RTRIM(ps_rlza.apllds)), '')
        ), CONCAT_WS(' ',
            NULLIF(LTRIM(RTRIM(ps_ordn.nmbrs)), ''),
            NULLIF(LTRIM(RTRIM(ps_ordn.apllds)), '')
        ))
    ))                                                               AS profesional_salud,
    LTRIM(RTRIM(ISNULL(esp.dscrpcn, '')))                           AS especialidad -- especialidad del profesional_salud (ps_rlza; si no hay, ps_ordn)
    , COUNT(*) OVER () AS total_registros
FROM tbHistoriasClinicas thc
LEFT JOIN tbTransacciones t
    ON t.unco = thc.unco_trnsccn
JOIN @cerrado er_hc
    ON er_hc.Unco = thc.unco_estdo_rgstro
LEFT JOIN @cerrado er
    ON er.Unco = t.unco_estdo_rgstro
-- Consultas de urgencias: la HC no tiene transaccion, se enlaza por admision (solo se evalúa cuando no hay transacción)
LEFT JOIN tbSedesPuntosAtencionTipoAtencion spta
    ON spta.unco = thc.Unco_sde_pnto_atncn_tpo_atncn
   AND t.unco IS NULL
LEFT JOIN tbTiposAtencion tau
    ON tau.unco = spta.unco_tpo_atncn
   AND UPPER(LTRIM(RTRIM(ISNULL(tau.dscrpcn, '')))) = 'URGENCIAS'
LEFT JOIN tbAdmisiones adm
    ON adm.unco = thc.unco_admsns
   AND t.unco IS NULL
OUTER APPLY (
    SELECT TOP 1 e.dscrpcn_emprsa
    FROM tbAdmisionesEmpresas e
    WHERE e.unco_admsns = adm.unco
    ORDER BY e.unco
) adm_e
LEFT JOIN tbProfesionalesSaludEspec pse_u
    ON pse_u.unco = thc.unco_prfsnls_sld_espcldd
   AND t.unco IS NULL
JOIN tbSedesPuntosAtencion spa
    ON spa.unco = COALESCE(t.Unco_sde_pnto_atncn, thc.Unco_sde_pnto_atncn)
JOIN tbSedes s
    ON s.unco = spa.unco_sde
JOIN tbAfiliadosEmpresas ae
    ON ae.unco = COALESCE(t.Unco_afldo_emprsa, thc.Unco_afldo_emprsa)
LEFT JOIN tbAfiliados afl
    ON afl.unco = ae.unco_afldo
LEFT JOIN tbMunicipios mncpo
    ON mncpo.unco = afl.unco_mncpo
LEFT JOIN tbTiposDocumentos td
    ON td.unco = COALESCE(t.unco_tpo_idntfccn, adm.unco_tpo_idntfccn, afl.unco_tpo_idntfccn)
LEFT JOIN tbSexos sx
    ON sx.unco = COALESCE(t.unco_sxo, adm.unco_sxo, afl.unco_sxo)
-- Detalle preferido de la transaccion (con profesional que realiza primero), sin CUOTA MODERADORA / COPAGO.
-- El filtro se aplica dentro de cada rama: servicios usa @def; suministros usa el catálogo (sin JOIN a @def).
OUTER APPLY (
    SELECT TOP 1
        d.unco_lna_prdcto,
        d.unco_prfsnls_sld_ordna,
        d.unco_prfsnls_sld_rlza
    FROM (
        SELECT
            ts.unco_lna_prdcto,
            ts.unco_prfsnls_sld_ordna,
            ts.unco_prfsnls_sld_rlza
        FROM tbTransaccionesServicios ts
        LEFT JOIN @def df
            ON df.unco_emprsa   = ae.unco_emprsa
           AND df.unco_prcdmnto = ts.unco_prcdmnto
        WHERE ts.unco_trnsccn = t.unco
          AND ISNULL(df.definicion, '') NOT IN ('CUOTA MODERADORA', 'COPAGO')
        UNION ALL
        SELECT
            tsu.unco_lna_prdcto,
            tsu.unco_prfsnls_sld_ordna,
            CAST(NULL AS BIGINT)
        FROM tbTransaccionesSuministros tsu
        LEFT JOIN tbCatalogoSuministrosMedicamentos cat2
            ON cat2.unco = tsu.unco_ctlgo_smnstrs_mdcmnts
        WHERE tsu.unco_trnsccn = t.unco
          AND UPPER(LTRIM(RTRIM(ISNULL(cat2.dscrpcn, '')))) NOT IN ('CUOTA MODERADORA', 'COPAGO')
    ) d
    ORDER BY CASE WHEN d.unco_prfsnls_sld_rlza IS NOT NULL THEN 0 ELSE 1 END,
             d.unco_lna_prdcto
) cdr
LEFT JOIN tbLineasProductos lp
    ON lp.unco = COALESCE(cdr.unco_lna_prdcto, thc.unco_lna_prdcto)
LEFT JOIN tbProfesionalesSalud ps_ordn
    ON ps_ordn.unco = cdr.unco_prfsnls_sld_ordna
LEFT JOIN tbProfesionalesSalud ps_rlza
    ON ps_rlza.unco = COALESCE(cdr.unco_prfsnls_sld_rlza, pse_u.unco_prfsnls_sld)
-- Especialidad activa mas reciente del profesional (precalculada en @esp)
LEFT JOIN @esp ce
    ON ce.unco_prfsnls_sld = COALESCE(cdr.unco_prfsnls_sld_rlza, cdr.unco_prfsnls_sld_ordna, pse_u.unco_prfsnls_sld)
LEFT JOIN tbEspecialidades esp
    ON esp.unco = COALESCE(pse_u.unco_espcldd, ce.unco_espcldd)
LEFT JOIN tbDiagnosticos dg1
    ON dg1.unco = thc.unco_dgnstco
LEFT JOIN tbDiagnosticos dg2
    ON dg2.unco = thc.unco_dgnstco_rlcndo1
LEFT JOIN tbDiagnosticos dg3
    ON dg3.unco = thc.unco_dgnstco_rlcndo2
CROSS APPLY (
    SELECT CAST(afl.fcha_ncmnto AS DATE) AS nac, CAST(thc.fcha_atncn AS DATE) AS atn
) f
CROSS APPLY (
    SELECT
        DATEDIFF(YEAR,  f.nac, f.atn) - CASE WHEN DATEADD(YEAR,  DATEDIFF(YEAR,  f.nac, f.atn), f.nac) > f.atn THEN 1 ELSE 0 END AS anios,
        DATEDIFF(MONTH, f.nac, f.atn) - CASE WHEN DATEADD(MONTH, DATEDIFF(MONTH, f.nac, f.atn), f.nac) > f.atn THEN 1 ELSE 0 END AS meses,
        DATEDIFF(DAY,   f.nac, f.atn) AS dias
) ed
-- Regimen de la propia transaccion (cualquier tipo de consulta); si es un tipo excluido, se usa la admision mas reciente del afiliado
OUTER APPLY (
    SELECT ta.dscrpcn AS rgmen, COALESCE(t.dscrpcn_emprsa_crta, adm_e.dscrpcn_emprsa) AS dscrpcn_emprsa
    FROM tbTiposAfiliados ta
    WHERE ta.unco = COALESCE(t.unco_tpo_afldo, adm.unco_tpo_afldo)
      AND COALESCE(t.unco_tpo_afldo, adm.unco_tpo_afldo) NOT IN (5, 9, 10)
      AND ae.unco_emprsa NOT IN (1, 4, 6, 17, 89, 10, 36, 37, 46, 5, 60, 64, 65, 61, 39, 63, 73, 80, 253, 241)
) ta_t
OUTER APPLY (
    SELECT TOP 1 ta.dscrpcn AS rgmen, e.dscrpcn_emprsa
    FROM tbAdmisiones a
    JOIN tbTiposAfiliados ta
        ON ta.unco = a.unco_tpo_afldo
    JOIN tbAdmisionesEmpresas e
        ON e.unco_admsns = a.unco
    WHERE ta_t.rgmen IS NULL
      AND a.unco_afldo = ae.unco_afldo
      AND ISDATE(a.fcha_admsn) = 1
      AND a.unco_tpo_afldo NOT IN (5, 9, 10)
      AND e.unco_emprsa NOT IN (1, 4, 6, 17, 89, 10, 36, 37, 46, 5, 60, 64, 65, 61, 39, 63, 73, 80, 253, 241)
    ORDER BY a.cnsctvo_admsns DESC
) rgm
WHERE thc.fcha_atncn >= @fcha_inicio
  AND thc.fcha_atncn <  @fcha_tope
  AND (:filtrar_sedes = 0 OR s.unco IN :sedes)
  AND (:filtrar_empresas = 0 OR ae.unco_emprsa IN :empresas)
  AND (:filtrar_lineas = 0 OR lp.unco IN :lineas)
  AND (
        er.Unco IS NOT NULL                                           -- consultas con transaccion cerrada
     OR (t.unco IS NULL AND thc.unco_trgge IS NULL AND tau.unco IS NOT NULL AND adm.unco IS NOT NULL)  -- consultas de urgencias (excluye triage)
  )
ORDER BY thc.fcha_atncn, t.unco, thc.unco
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
OPTION (RECOMPILE);
"""

VITAL_SIGNS_EXPORT_SQL = derive_export_sql(VITAL_SIGNS_SQL, "Signos Vitales")

VITAL_SIGNS_QUERY = ReadOnlyQuery(
    name="statistics.vital_signs",
    sql=VITAL_SIGNS_SQL,
    list_params=frozenset({"sedes", "empresas", "lineas"}),
)

VITAL_SIGNS_EXPORT_QUERY = ReadOnlyQuery(
    name="statistics.vital_signs_export",
    sql=VITAL_SIGNS_EXPORT_SQL,
    list_params=frozenset({"sedes", "empresas", "lineas"}),
)
