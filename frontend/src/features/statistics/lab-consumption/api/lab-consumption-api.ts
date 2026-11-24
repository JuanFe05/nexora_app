import { httpClient } from "@/lib/http/http-client";
import type { ExportColumn, ExportFormat } from "@/lib/table-export";
import { createReportApi } from "../../shared/report-api";
import type { ReportFilters } from "../../shared/types";
import type { AnalysisExport, LabConsumptionReport, LabConsumptionRow } from "../types";
import { uploadAnnarLab, uploadSerLaboral } from "./raw-upload";
const PATH = "/statistics/administrative/lab-consumption";
const reportApi = createReportApi<LabConsumptionRow>(PATH);
function query(filters: ReportFilters) {
  const params = new URLSearchParams({ fecha_inicial: filters.startDate, fecha_final: filters.endDate });
  for (const id of filters.sites) params.append("sedes", String(id));
  for (const id of filters.companies) params.append("empresas", String(id));
  return params;
}
/** Prefer the RFC 5987 UTF-8 name; malformed metadata must not prevent a download. */
function downloadName(headers: Headers, fallback: string) {
  const disposition = headers.get("Content-Disposition") ?? "";
  const encoded = /(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]*)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      const name = decodeURIComponent(encoded.trim());
      if (name) return name;
    } catch { /* Fall back to the plain filename or the date-based name. */ }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i.exec(disposition);
  return plain?.[1]?.replace(/\\(.)/g, "$1") || plain?.[2]?.trim() || fallback;
}
export const labConsumptionApi = {
  fetchSites: reportApi.fetchSites,
  fetchCompanies: reportApi.fetchCompanies,
  fetchReport: (filters: ReportFilters, signal?: AbortSignal) => httpClient.get<LabConsumptionReport>(`${PATH}?${query(filters)}`, { signal }),
  uploadSerLaboral,
  uploadAnnarLab,
  downloadAnalysis: (body: AnalysisExport, signal: AbortSignal) => httpClient.post<Blob>(`${PATH}/export/analysis/xlsx`, { body, responseType: "blob", signal }),
  download: async (filters: ReportFilters, columns: readonly ExportColumn[], format: ExportFormat, signal: AbortSignal, tokens: { serLaboralId?: string; annarLabId?: string } = {}) => {
    const params = query(filters);
    params.set("formato", format);
    for (const column of columns) params.append("columnas", `${column.id}:${column.type}`);
    if (tokens.serLaboralId) params.set("ser_laboral_id", tokens.serLaboralId);
    if (tokens.annarLabId) params.set("annar_lab_id", tokens.annarLabId);
    const { data, headers } = await httpClient.getWithMeta<Blob>(`${PATH}/export?${params}`, { signal, responseType: "blob" });
    const fallback = `consumo-laboratorio_${filters.startDate}_${filters.endDate}.${format === "csv" ? "zip" : "xlsx"}`;
    return { file: data, name: downloadName(headers, fallback) };
  },
};
