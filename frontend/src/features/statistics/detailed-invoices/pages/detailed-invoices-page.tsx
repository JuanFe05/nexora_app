import { ReportPage, type ReportDefinition } from "../../shared/report-page";
import { detailedInvoicesApi } from "../api/detailed-invoices-api";
import { defaultVisibleColumns, invoiceColumns, invoiceExportColumns } from "../columns";
import type { DetailedInvoice } from "../types";

const report: ReportDefinition<DetailedInvoice> = {
  idPrefix: "invoice",
  title: "Facturas Detalladas",
  description: "Consulta las facturas por período, sede, empresa y línea de producto.",
  filename: "facturas-detalladas",
  emptyTitle: "No hay facturas para este período.",
  api: detailedInvoicesApi,
  columns: invoiceColumns,
  exportColumns: invoiceExportColumns,
  defaultVisibleColumns,
};
export default function DetailedInvoicesPage() {
  return <ReportPage report={report} />;
}
