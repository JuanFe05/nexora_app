import { httpClient } from "@/lib/http/http-client";
import type { ExportColumn } from "@/lib/table-export";
import { createReportApi } from "../../shared/report-api";
import type { ReportFilters } from "../../shared/types";
import type { qualitySurveyColumns } from "../columns";

export type QualitySurveyRow = Record<(typeof qualitySurveyColumns)[number]["id"], string>;
export type QualitySurveysReport = { rows: QualitySurveyRow[]; total: number };
export type QualitySurveysFormat = "csv" | "xlsx";

const path = "/statistics/administrative/quality-surveys";
const { fetchSites, fetchCompanies, download } = createReportApi<QualitySurveyRow>(path);

export const qualitySurveysApi = {
  fetchSites,
  fetchCompanies,
  fetchReport(filters: ReportFilters, signal: AbortSignal) {
    const params = new URLSearchParams({
      fecha_inicial: filters.startDate,
      fecha_final: filters.endDate,
    });
    for (const id of filters.sites) params.append("sedes", String(id));
    for (const id of filters.companies) params.append("empresas", String(id));
    for (const id of filters.productLines) params.append("lineas", String(id));
    return httpClient.get<QualitySurveysReport>(`${path}?${params}`, { signal });
  },
  download(filters: ReportFilters, columns: readonly ExportColumn[], format: QualitySurveysFormat, signal: AbortSignal) {
    return download(filters, columns, format, signal);
  },
};
