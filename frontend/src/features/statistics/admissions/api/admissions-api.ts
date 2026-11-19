import { createReportApi } from "../../shared/report-api";
import type { Admission } from "../types";

export const admissionsApi = createReportApi<Admission>("/statistics/reports/admissions");
export const {
  fetchSites,
  fetchCompanies,
  fetchProductLines,
  fetchPage: fetchAdmissions,
  download: downloadAdmissions,
} = admissionsApi;
