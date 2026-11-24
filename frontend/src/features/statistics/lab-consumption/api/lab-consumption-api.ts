import { httpClient } from "@/lib/http/http-client";
import type { ExportColumn, ExportFormat } from "@/lib/table-export";
import { createReportApi } from "../../shared/report-api";
import type { ReportFilters } from "../../shared/types";
import type { LabConsumptionReport, LabConsumptionRow, LabTable } from "../types";
import { uploadAnnarLab, uploadSerLaboral } from "./raw-upload";
const PATH = "/statistics/administrative/lab-consumption";
const reportApi = createReportApi<LabConsumptionRow>(PATH);
function query(filters: ReportFilters) {
  const params = new URLSearchParams({ fecha_inicial: filters.startDate, fecha_final: filters.endDate });
  for (const id of filters.sites) params.append("sedes", String(id));
  for (const id of filters.companies) params.append("empresas", String(id));
  return params;
}
export const labConsumptionApi = {
  fetchSites: reportApi.fetchSites,
  fetchCompanies: reportApi.fetchCompanies,
  fetchReport: (filters: ReportFilters, signal?: AbortSignal) => httpClient.get<LabConsumptionReport>(`${PATH}?${query(filters)}`, { signal }),
  uploadSerLaboral,
  uploadAnnarLab,
  download: (filters: ReportFilters, columns: readonly ExportColumn[], format: ExportFormat, signal: AbortSignal, tokens: { serLaboralId?: string; annarLabId?: string } = {}, tablas?: LabTable[]) => {
    const params = query(filters);
    params.set("formato", format);
    for (const column of columns) params.append("columnas", `${column.id}:${column.type}`);
    for (const table of tablas ?? []) params.append("tablas", table);
    if (tokens.serLaboralId) params.set("ser_laboral_id", tokens.serLaboralId);
    if (tokens.annarLabId) params.set("annar_lab_id", tokens.annarLabId);
    return httpClient.getBlob(`${PATH}/export?${params}`, { signal });
  },
};
