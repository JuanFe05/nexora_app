import { ReportPage, type ReportDefinition } from "../../shared/report-page";
import { vitalSignsApi } from "../api/vital-signs-api";
import { defaultVisibleColumns, vitalSignsColumns, vitalSignsExportColumns } from "../columns";
import type { VitalSign } from "../types";

const report: ReportDefinition<VitalSign> = {
  idPrefix: "vital-signs",
  title: "Signos Vitales",
  description: "Consulta los signos vitales por período, sede, empresa y línea de producto.",
  filename: "signos-vitales",
  emptyTitle: "No hay signos vitales para este período.",
  api: vitalSignsApi,
  columns: vitalSignsColumns,
  exportColumns: vitalSignsExportColumns,
  defaultVisibleColumns,
};
export default function VitalSignsPage() {
  return <ReportPage report={report} />;
}
