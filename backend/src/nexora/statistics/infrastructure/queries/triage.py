"""Triaje, derivada de data_ips/Triaje.sql e incluida en el paquete.

Diff respecto al original: SET NOCOUNT ON y READ UNCOMMITTED antes del WITH;
fechas enlazadas; filtros de sede y empresa efectiva en el WHERE final;
COUNT(*) OVER (); desempate estable por pa.unco, thc_trge.unco y thc_atncn.unco
junto al consecutivo original y OFFSET/FETCH. Las 38 columnas, calculos, joins
y reglas originales se conservan. No hay relacion con linea de producto.
La exportacion se deriva del SQL paginado con el mecanismo compartido.
"""

# ruff: noqa: E501 -- SQL original conservado para permitir auditoria por diff.
from nexora.integration_management.application.ports import ReadOnlyQuery
from nexora.statistics.infrastructure.queries.export_sql import derive_export_sql

TRIAGE_SQL = r"""
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- PARAMETROS: fechas de ingreso (ambas inclusivas)
DECLARE @FechaInicio DATE = CAST(:fecha_inicial AS DATE);
DECLARE @FechaFin    DATE = CAST(:fecha_final AS DATE);   -- inclusive
DECLARE @FechaFinExc DATE = DATEADD(DAY, 1, @FechaFin);  -- limite exclusivo (no modificar)

-- Empresas de admision SOLO de las admisiones que aparecen en el rango (evita recorrer toda la tabla)
WITH ae_sel AS (
    SELECT ae_adm.unco, ae_adm.unco_admsns, ae_adm.unco_emprsa
    FROM tbAdmisionesEmpresas ae_adm WITH (NOLOCK)
    WHERE EXISTS (
        SELECT 1
        FROM tbPreadmision pa0 WITH (NOLOCK)
        WHERE pa0.unco_admsns = ae_adm.unco_admsns
          AND pa0.fcha_ingrso >= @FechaInicio
          AND pa0.fcha_ingrso <  @FechaFinExc
    )
),

-- Servicios + suministros facturados por empresa de admision (set-based, una sola vez)
-- COUNT(servicios) + COUNT(suministros) == COUNT(*) de la union de ambas ramas
srv AS (
    SELECT t.unco_ae, COUNT(*) AS total
    FROM (
        SELECT aep.unco_admsns_emprss AS unco_ae
        FROM tbAdmisionesEmpresasPuntosAtencion aep WITH (NOLOCK)
        JOIN ae_sel s ON s.unco = aep.unco_admsns_emprss
        JOIN tbAdmisionesServiciosDetalle asd WITH (NOLOCK)
            ON asd.unco_admsn_emprss_pnts_atncn = aep.unco AND asd.estdo = 1 AND asd.psr = 1
        UNION ALL
        SELECT aep.unco_admsns_emprss
        FROM tbAdmisionesEmpresasPuntosAtencion aep WITH (NOLOCK)
        JOIN ae_sel s ON s.unco = aep.unco_admsns_emprss
        JOIN tbAdmisionesSuministrosDetalle smd WITH (NOLOCK)
            ON smd.unco_admsn_emprss_pnts_atncn = aep.unco AND smd.estdo = 1 AND smd.psr = 1
    ) t
    GROUP BY t.unco_ae
),

-- Empresa "activa" por admision: mayor numero de servicios, desempate por unco ASC (igual que el TOP 1 original)
ae_top AS (
    SELECT x.unco_admsns, x.unco_emprsa
    FROM (
        SELECT s.unco_admsns, s.unco_emprsa,
               ROW_NUMBER() OVER (
                   PARTITION BY s.unco_admsns
                   ORDER BY ISNULL(v.total, 0) DESC, s.unco ASC
               ) AS rn
        FROM ae_sel s
        LEFT JOIN srv v ON v.unco_ae = s.unco
    ) x
    WHERE x.rn = 1
)

SELECT
    LTRIM(RTRIM(ISNULL(s.dscrpcn,   '')))                                               AS sede,
    ISNULL(pa.cnsctvo_trgge, 0)                                                         AS cnsctvo_trgge,
    ISNULL(adm.cnsctvo_admsns, 0)                                                       AS cnsctvo_admsns,
    LTRIM(RTRIM(ISNULL(er_adm.dscrpcn, '')))                                            AS estdo_admsn,
    LTRIM(RTRIM(ISNULL(td.cdgo, '')))                                                   AS cdgo_tpo_dcmnto,
    LTRIM(RTRIM(ISNULL(afl.nmro_idntfccn, '')))                                         AS nmro_idntfccn,

    LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(afl.prmr_nmbre,
        CHAR(9), ''), CHAR(13), ''), CHAR(10), '')))                                    AS prmr_nmbre,

    LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(afl.sgndo_nmbre,
        CHAR(9), ''), CHAR(13), ''), CHAR(10), '')))                                    AS sgndo_nmbre,

    LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(afl.prmr_aplldo,
        CHAR(9), ''), CHAR(13), ''), CHAR(10), '')))                                    AS prmr_aplldo,

    LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(afl.sgndo_aplldo,
        CHAR(9), ''), CHAR(13), ''), CHAR(10), '')))                                    AS sgndo_aplldo,

    LTRIM(RTRIM(ISNULL(
        CASE WHEN edd_pos.sp > 0
             THEN LEFT(adm.edd, edd_pos.sp - 1)
             ELSE adm.edd END, '')))                                                    AS edd,
    LTRIM(RTRIM(ISNULL(
        CASE WHEN edd_pos.sp > 0
             THEN SUBSTRING(adm.edd, edd_pos.sp + 1, LEN(adm.edd))
             ELSE '' END, '')))                                                         AS tipo_edd,
    ISNULL(CONVERT(VARCHAR(10), afl.fcha_ncmnto, 120), '')                              AS fcha_ncmnto,
    LTRIM(RTRIM(ISNULL(sx.cdgo, '')))                                                   AS sexo,
    LTRIM(RTRIM(ISNULL(emp.dscrpcn_crta, '')))                                          AS empresa,
    LTRIM(RTRIM(ISNULL(tpe.dscrpcn, '')))                                               AS tpo_empresa,

    LTRIM(RTRIM(ISNULL(td_ps.cdgo, '')))                                                AS tpo_idntfccn_profesional,
    LTRIM(RTRIM(ISNULL(CAST(ps.nmro_idntfccn AS VARCHAR(30)), '')))                     AS nmro_idntfccn_profesional,

    LTRIM(RTRIM(
        CONCAT_WS(' ',
            NULLIF(LTRIM(RTRIM(ps.nmbrs)), ''),
            NULLIF(LTRIM(RTRIM(ps.apllds)), '')
        )
    ))                                                                                  AS profesional_salud,

    LTRIM(RTRIM(ISNULL(trg.cdgo, '')))                                                  AS cdgo,
    LTRIM(RTRIM(ISNULL(er.dscrpcn, '')))                                                AS estdo_rgstro,
    ISNULL(CONVERT(VARCHAR(10), pa.fcha_ingrso,   103) + ' ' + CONVERT(VARCHAR(8), pa.fcha_ingrso,   108), '') AS fcha_ingrso,
    ISNULL(CONVERT(VARCHAR(10), thc_trge.fcha_atncn,  103) + ' ' + CONVERT(VARCHAR(8), thc_trge.fcha_atncn,  108), '') AS fcha_trge,
    ISNULL(CONVERT(VARCHAR(10), adm.fcha_admsn,        103) + ' ' + CONVERT(VARCHAR(8), adm.fcha_admsn,        108), '') AS fcha_admsn,
    ISNULL(CONVERT(VARCHAR(10), thc_atncn.fcha_atncn,  103) + ' ' + CONVERT(VARCHAR(8), thc_atncn.fcha_atncn,  108), '') AS fcha_atncn,
    -- Tiempos en minutos
    ISNULL(DATEDIFF(MINUTE, pa.fcha_ingrso,       thc_trge.fcha_atncn),  0)              AS t_prdmsn_trgge,
    ISNULL(DATEDIFF(MINUTE, thc_trge.fcha_atncn,  adm.fcha_admsn),       0)              AS t_trgge_admsn,
    ISNULL(DATEDIFF(MINUTE, adm.fcha_admsn,       thc_atncn.fcha_atncn), 0)              AS t_admsn_prdmsn,
    ISNULL(DATEDIFF(MINUTE, pa.fcha_ingrso,       thc_atncn.fcha_atncn), 0)              AS t_prdmsn_atncn,
    -- Signos vitales (tbPreadmision)
    ISNULL(pa.tnsn_artrl_alta,  0)                                                      AS tnsn_artrl_alta,
    ISNULL(pa.tnsn_artrl_bja,   0)                                                      AS tnsn_artrl_bja,
    ISNULL(pa.frcnca_crdca,     0)                                                      AS frcnca_crdca,
    ISNULL(pa.frcnca_rsprtra,   0)                                                      AS frcnca_rsprtra,
    ISNULL(pa.tmprtra,          0)                                                      AS tmprtra,
    ISNULL(pa.pso,              0)                                                      AS pso,
    ISNULL(pa.tlla,             0)                                                      AS tlla,
    ISNULL(pa.imc,              0)                                                      AS imc,
    ISNULL(TRY_CAST(
        LEFT(pb.tk, PATINDEX('%[^0-9.]%', pb.tk + 'X') - 1)
    AS DECIMAL(5,1)), 0)                                                                AS prmtro_brql
    , COUNT(*) OVER () AS total_registros

FROM tbPreadmision pa WITH (NOLOCK)
JOIN tbSedesPuntosAtencionTipoAtencion spata WITH (NOLOCK)
    ON spata.unco = pa.Unco_sde_pnto_atncn_tpo_atncn
JOIN tbSedesPuntosAtencion spa WITH (NOLOCK)
    ON spa.unco = spata.unco_sds_pnto_atncn
JOIN tbSedes s WITH (NOLOCK)
    ON s.unco = spa.unco_sde
JOIN tbAfiliadosEmpresas ae WITH (NOLOCK)
    ON ae.unco = pa.Unco_afldo_emprsa
JOIN tbAfiliados afl WITH (NOLOCK)
    ON afl.unco = ae.unco_afldo
-- Si hay admision, empresa con mas servicios facturados; si no, la de tbAfiliadosEmpresas
LEFT JOIN ae_top ae_actv
    ON ae_actv.unco_admsns = pa.unco_admsns
JOIN tbEmpresas emp WITH (NOLOCK)
    ON emp.unco = ISNULL(ae_actv.unco_emprsa, ae.unco_emprsa)
LEFT JOIN tbTipoEmpresa tpe WITH (NOLOCK)
    ON tpe.unco = emp.unco_tpo_emprsa
LEFT JOIN tbTiposDocumentos td WITH (NOLOCK)
    ON td.unco = afl.unco_tpo_idntfccn
LEFT JOIN tbSexos sx WITH (NOLOCK)
    ON sx.unco = afl.unco_sxo
LEFT JOIN tbAdmisiones adm WITH (NOLOCK)
    ON adm.unco = pa.unco_admsns
LEFT JOIN tbProfesionalesSaludEspec pse WITH (NOLOCK)
    ON pse.unco = pa.unco_prfsnls_sld_espcldd
LEFT JOIN tbProfesionalesSalud ps WITH (NOLOCK)
    ON ps.unco = pse.unco_prfsnls_sld
LEFT JOIN tbTiposDocumentos td_ps WITH (NOLOCK)
    ON td_ps.unco = ps.unco_tpo_idntfccn
LEFT JOIN tbTriagge trg WITH (NOLOCK)
    ON trg.unco = pa.unco_trgge
LEFT JOIN tbEstadosRegistros er WITH (NOLOCK)
    ON er.unco = pa.unco_estdo_rgstro
LEFT JOIN tbEstadosRegistros er_adm WITH (NOLOCK)
    ON er_adm.unco = adm.unco_estdo_rgstro
LEFT JOIN tbHistoriasClinicas thc_trge WITH (NOLOCK)
    ON thc_trge.unco_trgge = pa.unco
LEFT JOIN tbHistoriasClinicas thc_atncn WITH (NOLOCK)
    ON thc_atncn.unco_admsns = adm.unco AND thc_atncn.unco_trgge IS NULL
-- Posiciones calculadas una sola vez por fila
CROSS APPLY (SELECT CHARINDEX(' ', adm.edd) AS sp) edd_pos
-- obsrvcns es NTEXT: se convierte una sola vez a NVARCHAR(MAX) para no leer el LOB varias veces
CROSS APPLY (SELECT CAST(pa.obsrvcns AS NVARCHAR(MAX)) AS o) ob
CROSS APPLY (SELECT CHARINDEX('P.B:', ob.o) AS p1, CHARINDEX('PB:', ob.o) AS p2) pbpos
CROSS APPLY (
    SELECT CASE
               WHEN pbpos.p1 > 0 THEN SUBSTRING(ob.o, pbpos.p1 + 4, 10)
               WHEN pbpos.p2 > 0 THEN SUBSTRING(ob.o, pbpos.p2 + 3, 10)
           END AS tk
) pb

WHERE pa.fcha_ingrso >= @FechaInicio
  AND pa.fcha_ingrso <  @FechaFinExc
  AND (:filtrar_sedes = 0 OR s.unco IN :sedes)
  AND (:filtrar_empresas = 0 OR emp.unco IN :empresas)

ORDER BY pa.cnsctvo_trgge, pa.unco, thc_trge.unco, thc_atncn.unco
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
OPTION (RECOMPILE)  -- el optimizador usa los valores reales de las fechas para estimar filas
"""

TRIAGE_EXPORT_SQL = derive_export_sql(TRIAGE_SQL, "Triaje")

TRIAGE_QUERY = ReadOnlyQuery(
    name="statistics.triage",
    sql=TRIAGE_SQL,
    list_params=frozenset({"sedes", "empresas"}),
)

TRIAGE_EXPORT_QUERY = ReadOnlyQuery(
    name="statistics.triage_export",
    sql=TRIAGE_EXPORT_SQL,
    list_params=frozenset({"sedes", "empresas"}),
)
