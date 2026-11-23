import { ReceiptIcon } from "@/icons";
import { ReportPage, type ReportDefinition } from "../../shared/report-page";
import { generalBillingApi } from "../api/general-billing-api";
import { defaultVisibleColumns, generalBillingColumns, generalBillingExportColumns } from "../columns";
import type { GeneralBilling } from "../types";

const report: ReportDefinition<GeneralBilling> = {
  idPrefix: "general-billing",
  icon: <ReceiptIcon />,
  title: "Facturación General",
  description: "Consulta la facturación general por período, sede, empresa y línea de producto.",
  filename: "facturacion-general",
  emptyTitle: "No hay facturación general para este período.",
  api: generalBillingApi,
  columns: generalBillingColumns,
  exportColumns: generalBillingExportColumns,
  defaultVisibleColumns,
};
export default function GeneralBillingPage() {
  return <ReportPage report={report} />;
}
