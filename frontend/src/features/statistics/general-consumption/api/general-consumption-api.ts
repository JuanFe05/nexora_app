import { httpClient } from "@/lib/http/http-client";
import { createReportApi } from "../../shared/report-api";
import type { ReportFilters } from "../../shared/types";
import type { ConsumptionIndicator, GeneralConsumptionReport, GeneralConsumptionRow } from "../types";

const PATH = "/statistics/administrative/general-consumption";
const reportApi = createReportApi<GeneralConsumptionRow>(PATH);

function query(filters: ReportFilters) {
  const params = new URLSearchParams({ fecha_inicial: filters.startDate, fecha_final: filters.endDate });
  for (const id of filters.sites) params.append("sedes", String(id));
  for (const id of filters.companies) params.append("empresas", String(id));
  for (const id of filters.productLines) params.append("lineas", String(id));
  return params;
}

export const generalConsumptionApi = {
  fetchSites: reportApi.fetchSites,
  fetchCompanies: reportApi.fetchCompanies,
  fetchProductLines: reportApi.fetchProductLines,
  /** Una solicitud alimenta las tres pestañas; sin paginación remota ni endpoint /columns (40 columnas locales). */
  fetchReport: (filters: ReportFilters, signal?: AbortSignal) =>
    httpClient.get<GeneralConsumptionReport>(`${PATH}?${query(filters)}`, { signal }),
  /** El backend concatena Facturas Detalladas y Admisiones; no recibe indicadores. */
  download: reportApi.download,
  exportAnalysis: (indicadores: ConsumptionIndicator[], format: "pdf" | "xlsx", signal?: AbortSignal) =>
    httpClient.post<Blob>(`${PATH}/export/analysis/${format}`, { body: { indicadores }, responseType: "blob", signal }),
};
