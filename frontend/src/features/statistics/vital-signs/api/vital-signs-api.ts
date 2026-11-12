import { createReportApi } from "../../shared/report-api";
import type { VitalSign } from "../types";

export const vitalSignsApi = createReportApi<VitalSign>("/statistics/reports/vital-signs");
export const {
  fetchSites,
  fetchCompanies,
  fetchProductLines,
  fetchPage: fetchVitalSigns,
  download: downloadVitalSigns,
} = vitalSignsApi;
