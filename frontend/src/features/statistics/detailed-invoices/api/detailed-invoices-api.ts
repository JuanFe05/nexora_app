import { createReportApi } from "../../shared/report-api";
import type { DetailedInvoice } from "../types";

export const detailedInvoicesApi = createReportApi<DetailedInvoice>("/statistics/reports/detailed-invoices");
export const {
  fetchSites,
  fetchCompanies,
  fetchProductLines,
  fetchPage: fetchDetailedInvoices,
  download: downloadDetailedInvoices,
} = detailedInvoicesApi;
