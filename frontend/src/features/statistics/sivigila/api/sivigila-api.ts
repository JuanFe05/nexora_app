import { httpClient } from "@/lib/http/http-client";
import { createReportApi } from "../../shared/report-api";
import type { ReportFilters } from "../../shared/types";
import type { SivigilaReport } from "../types";

const PATH = "/statistics/administrative/sivigila";
const catalogs = createReportApi<never>(PATH);

function query(filters: ReportFilters) {
  const params = new URLSearchParams({ fecha_inicial: filters.startDate, fecha_final: filters.endDate });
  for (const id of filters.sites) params.append("sedes", String(id));
  for (const id of filters.companies) params.append("empresas", String(id));
  for (const id of filters.productLines) params.append("lineas", String(id));
  return params;
}

/** One request returns the analysis and every tab: the backend runs the Signos Vitales query once. */
export const sivigilaApi = {
  fetchSites: catalogs.fetchSites,
  fetchCompanies: catalogs.fetchCompanies,
  fetchProductLines: catalogs.fetchProductLines,
  fetchReport: (filters: ReportFilters, signal?: AbortSignal) => httpClient.get<SivigilaReport>(`${PATH}?${query(filters)}`, { signal }),
  /** Both exports render the already processed result shown in the module: no new SQL Server query. */
  exportAnalysisPdf: (report: SivigilaReport, signal?: AbortSignal) =>
    httpClient.post<Blob>(`${PATH}/export/pdf`, { body: report, responseType: "blob", signal }),
  exportWorkbook: (report: SivigilaReport, signal?: AbortSignal) =>
    httpClient.post<Blob>(`${PATH}/export/xlsx`, { body: report, responseType: "blob", signal }),
};
