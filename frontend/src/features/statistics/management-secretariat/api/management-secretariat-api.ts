import { createReportApi } from "../../shared/report-api";
import type { ManagementSecretariatRow } from "../columns";

export const managementSecretariatApi = createReportApi<ManagementSecretariatRow>(
  "/statistics/administrative/management-secretariat/detailed-invoices",
  { searchParam: "buscar" },
);
