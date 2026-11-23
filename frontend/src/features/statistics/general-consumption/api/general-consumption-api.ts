import type { ExportColumn, ExportFormat } from "@/lib/table-export";
import { uploadSerLaboral } from "./ser-laboral-upload";
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
  /** Una solicitud alimenta las pestañas generales; sin paginación remota ni endpoint /columns (40 columnas locales). */
  fetchReport: (filters: ReportFilters, signal?: AbortSignal) =>
    httpClient.get<GeneralConsumptionReport>(`${PATH}?${query(filters)}`, { signal }),
  uploadSerLaboral,
  /** Con token, añade Ser Laboral al final; conserva la descarga compartida sin CSV cargado. */
  download: (filters: ReportFilters, columns: readonly ExportColumn[], format: ExportFormat, signal: AbortSignal, serLaboralId?: string) => {
    if (!serLaboralId) return reportApi.download(filters, columns, format, signal);
    const params = query(filters);
    params.set("formato", format);
    for (const column of columns) params.append("columnas", `${column.id}:${column.type}`);
    params.set("ser_laboral_id", serLaboralId);
    return httpClient.getBlob(`${PATH}/export?${params}`, { signal });
  },
  exportAnalysis: (indicadores: ConsumptionIndicator[], format: "pdf" | "xlsx", signal?: AbortSignal) =>
    httpClient.post<Blob>(`${PATH}/export/analysis/${format}`, { body: { indicadores }, responseType: "blob", signal }),
};
