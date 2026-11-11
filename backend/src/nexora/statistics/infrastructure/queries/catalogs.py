"""Named, fixed SQL queries for report filter options."""

from nexora.integration_management.application.ports import ReadOnlyQuery

SITES = ReadOnlyQuery(
    name="statistics.detailed_invoices.sites",
    sql="""SET NOCOUNT ON;
SELECT s.unco AS id, LTRIM(RTRIM(s.dscrpcn)) AS nombre
FROM tbSedes s WITH (NOLOCK)
ORDER BY nombre
""",
)

# PROVISIONAL: derived from proven report columns, NOT the real company catalog.
# Replace with the real catalog table once verified against SQL Server. This limits
# options to companies with transactions in the last 365 days; it is not exhaustive.
COMPANIES = ReadOnlyQuery(
    name="statistics.detailed_invoices.companies",
    sql="""SET NOCOUNT ON;
SELECT ae.unco_emprsa AS id, MAX(LTRIM(RTRIM(t.dscrpcn_emprsa_crta))) AS nombre
FROM tbTransacciones t WITH (NOLOCK)
JOIN tbAfiliadosEmpresas ae WITH (NOLOCK) ON ae.unco = t.Unco_afldo_emprsa
WHERE ae.unco_emprsa IS NOT NULL
  AND t.fcha_dcto >= DATEADD(DAY, -365, CAST(GETDATE() AS DATE))
GROUP BY ae.unco_emprsa
ORDER BY nombre
""",
)
