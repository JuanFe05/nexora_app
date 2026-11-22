import { createReportApi } from "../../shared/report-api";
import type { GeneralBilling } from "../types";

export const generalBillingApi = createReportApi<GeneralBilling>("/statistics/administrative/general-billing");
export const {
  fetchSites,
  fetchCompanies,
  fetchProductLines,
  fetchPage: fetchGeneralBilling,
  download: downloadGeneralBilling,
} = generalBillingApi;
