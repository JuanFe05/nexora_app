"""Se han definido consultas SQL fijas para las opciones de filtro de los informes."""

from nexora.integration_management.application.ports import ReadOnlyQuery

SITES = ReadOnlyQuery(
    name="statistics.detailed_invoices.sites",
    sql="""SET NOCOUNT ON;
SELECT s.unco AS id, LTRIM(RTRIM(s.dscrpcn)) AS nombre
FROM tbSedes s WITH (NOLOCK)
ORDER BY nombre
""",
)

PRODUCT_LINES = ReadOnlyQuery(
    name="statistics.product_lines",
    sql="""SET NOCOUNT ON;
SELECT lp.unco AS id, LTRIM(RTRIM(lp.dscrpcn)) AS nombre
FROM tbLineasProductos lp WITH (NOLOCK)
ORDER BY nombre
""",
)

# tbEmpresas is the target of the FK tbAfiliadosEmpresas.unco_emprsa. It is not filtered by
# estdo so historical invoices of inactive companies can still be queried.
COMPANIES = ReadOnlyQuery(
    name="statistics.detailed_invoices.companies",
    sql="""SET NOCOUNT ON;
SELECT e.unco AS id, LTRIM(RTRIM(e.dscrpcn_crta)) AS nombre
FROM tbEmpresas e WITH (NOLOCK)
ORDER BY nombre
""",
)
