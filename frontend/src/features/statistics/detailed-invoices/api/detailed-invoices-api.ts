import { pagedResult } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import type { CatalogOption, DetailedInvoice, InvoiceFilters } from "../types";

const reportPath = "/statistics/reports/detailed-invoices";
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
