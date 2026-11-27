import { pagedResult, type PagedQueryParams } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import type { ExportColumn, ExportFormat } from "@/lib/table-export";
import type { CatalogOption, ReportFilters } from "../../shared/types";
import type { Incapacity } from "../columns";

const reportPath = "/statistics/administrative/disability-management";

function filterParams(filters: ReportFilters, search: string) {
  const params = new URLSearchParams({
    fecha_inicial: filters.startDate,
    fecha_final: filters.endDate,
  });
  for (const id of filters.companies) params.append("empresas", String(id));
  const term = search.trim();
  if (term) params.set("search", term);
  return params;
}

export const incapacitiesApi = {
  fetchCompanies: (signal?: AbortSignal) =>
    httpClient.get<CatalogOption[]>(`${reportPath}/filters/companies`, { signal }),
  fetchPage: async (filters: ReportFilters, { q, limit, offset, signal }: PagedQueryParams) => {
    const params = filterParams(filters, q);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return pagedResult(await httpClient.getWithMeta<Incapacity[]>(`${reportPath}?${params}`, { signal }));
  },
  download: (filters: ReportFilters, search: string, columns: readonly ExportColumn[], format: ExportFormat, signal: AbortSignal) => {
    const params = filterParams(filters, search);
    params.set("formato", format);
    for (const column of columns) params.append("columnas", `${column.id}:${column.type}`);
    return httpClient.getBlob(`${reportPath}/export?${params}`, { signal });
  },
};
