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

/** Una sola solicitud devuelve el análisis y todas las pestañas: el backend ejecuta la query de Signos Vitales una vez. */
export const sivigilaApi = {
  fetchSites: catalogs.fetchSites,
  fetchCompanies: catalogs.fetchCompanies,
  fetchProductLines: catalogs.fetchProductLines,
  fetchReport: (filters: ReportFilters, signal?: AbortSignal) => httpClient.get<SivigilaReport>(`${PATH}?${query(filters)}`, { signal }),
  /** Ambas exportaciones generan el archivo con el resultado ya procesado que muestra el módulo: sin nueva consulta a SQL Server. */
  exportAnalysisPdf: (report: SivigilaReport, signal?: AbortSignal) =>
    httpClient.post<Blob>(`${PATH}/export/pdf`, { body: report, responseType: "blob", signal }),
  exportWorkbook: (report: SivigilaReport, signal?: AbortSignal) =>
    httpClient.post<Blob>(`${PATH}/export/xlsx`, { body: report, responseType: "blob", signal }),
};
