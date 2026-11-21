import { httpClient } from "@/lib/http/http-client";
import type { ExportFormat } from "@/lib/table-export";
import { createReportApi } from "../../shared/report-api";
import type { ReportFilters } from "../../shared/types";
import type { SivigilaEvent, SivigilaReport } from "../types";

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
  download: (filters: ReportFilters, evento: SivigilaEvent, columns: readonly string[], format: ExportFormat, signal: AbortSignal) => {
    const params = query(filters);
    params.set("formato", format);
    params.set("evento", evento);
    for (const column of columns) params.append("columnas", column);
    return httpClient.getBlob(`${PATH}/export?${params}`, { signal });
  },
};
