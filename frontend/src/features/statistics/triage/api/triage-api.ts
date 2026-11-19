import { createReportApi } from "../../shared/report-api";
import type { Triage } from "../types";

const api = createReportApi<Triage>("/statistics/reports/triage");
/** Triaje has no product-line relation, even if a caller supplies draft line ids. */
export const triageApi = {
  fetchSites: api.fetchSites,
  fetchCompanies: api.fetchCompanies,
  fetchPage: (filters: Parameters<typeof api.fetchPage>[0], params: Parameters<typeof api.fetchPage>[1]) =>
    api.fetchPage({ ...filters, productLines: [] }, params),
  download: (...[filters, columns, format, signal]: Parameters<typeof api.download>) =>
    api.download({ ...filters, productLines: [] }, columns, format, signal),
};
export const { fetchSites, fetchCompanies, fetchPage: fetchTriage, download: downloadTriage } = triageApi;
