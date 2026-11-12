import { pagedResult, type PagedQueryParams } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import type { ExportColumn, ExportFormat } from "@/lib/table-export";
import type { CatalogOption, ReportFilters } from "./types";

function filterParams(filters: ReportFilters) {
  const params = new URLSearchParams({
    fecha_inicial: filters.startDate,
    fecha_final: filters.endDate,
  });
  for (const id of filters.sites) params.append("sedes", String(id));
  for (const id of filters.companies) params.append("empresas", String(id));
  for (const id of filters.productLines) params.append("lineas", String(id));
  return params;
}

/** Report adapters share parameter serialization and the existing HTTP/pagination boundaries. */
export function createReportApi<TRow>(reportPath: string) {
  const catalog = (name: string) => (signal?: AbortSignal) =>
    httpClient.get<CatalogOption[]>(`${reportPath}/filters/${name}`, { signal });
  return {
    fetchSites: catalog("sites"),
    fetchCompanies: catalog("companies"),
    fetchProductLines: catalog("product-lines"),
    fetchPage: async (filters: ReportFilters, { limit, offset, signal }: Pick<PagedQueryParams, "limit" | "offset" | "signal">) => {
      const params = filterParams(filters);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      return pagedResult(await httpClient.getWithMeta<TRow[]>(`${reportPath}?${params}`, { signal }));
    },
    /** Streams every row as one file, without the table's page limit or any client-side row cap. */
    download: (filters: ReportFilters, columns: readonly ExportColumn[], format: ExportFormat, signal: AbortSignal) => {
      const params = filterParams(filters);
      params.set("formato", format);
      for (const column of columns) params.append("columnas", `${column.id}:${column.type}`);
      return httpClient.getBlob(`${reportPath}/export?${params}`, { signal });
    },
  };
}
