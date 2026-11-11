import { pagedResult } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import { ExportError } from "@/lib/table-export";
import type { CatalogOption, DetailedInvoice, InvoiceFilters } from "../types";

const reportPath = "/statistics/reports/detailed-invoices";
const EXPORT_PAGE_SIZE = 100;
export const EXPORT_MAX_ROWS = 20000;
export function fetchSites(signal?: AbortSignal) {
  return httpClient.get<CatalogOption[]>(`${reportPath}/filters/sites`, {
    signal,
  });
}
export function fetchCompanies(signal?: AbortSignal) {
  return httpClient.get<CatalogOption[]>(`${reportPath}/filters/companies`, {
    signal,
  });
}
export async function fetchDetailedInvoices(
  filters: InvoiceFilters,
  {
    limit,
    offset,
    signal,
  }: { limit: number; offset: number; signal: AbortSignal },
) {
  const params = new URLSearchParams({
    fecha_inicial: filters.startDate,
    fecha_final: filters.endDate,
    limit: String(limit),
    offset: String(offset),
  });
  for (const id of filters.sites) params.append("sedes", String(id));
  for (const id of filters.companies) params.append("empresas", String(id));
  return pagedResult(
    await httpClient.getWithMeta<DetailedInvoice[]>(`${reportPath}?${params}`, {
      signal,
    }),
  );
}

/** Reads every page of the applied query (the API caps a page at 100 rows) to export the full result. */
export async function fetchAllDetailedInvoices(
  filters: InvoiceFilters,
  signal: AbortSignal,
) {
  const rows: DetailedInvoice[] = [];
  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    const page = await fetchDetailedInvoices(filters, {
      limit: EXPORT_PAGE_SIZE,
      offset,
      signal,
    });
    if (page.total > EXPORT_MAX_ROWS)
      throw new ExportError(
        `El resultado supera el límite de ${EXPORT_MAX_ROWS.toLocaleString("es-CO")} registros para exportar. Acota el período o los filtros.`,
      );
    rows.push(...page.items);
    if (!page.items.length || rows.length >= page.total) return rows;
  }
}
