import { ReportPage, type ReportDefinition } from "../../shared/report-page";
import { admissionsApi } from "../api/admissions-api";
import { admissionsColumns, admissionsExportColumns, defaultVisibleColumns } from "../columns";
import type { Admission } from "../types";

const report: ReportDefinition<Admission> = {
  idPrefix: "admissions",
  title: "Admisiones",
  description: "Consulta las admisiones por período, sede, empresa y línea de producto.",
  filename: "admisiones",
  emptyTitle: "No hay admisiones para este período.",
  api: admissionsApi,
  columns: admissionsColumns,
  exportColumns: admissionsExportColumns,
  defaultVisibleColumns,
};
export default function AdmissionsPage() {
  return <ReportPage report={report} />;
}
