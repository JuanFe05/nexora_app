import { ReportPage, type ReportDefinition } from "../../shared/report-page";
import { triageApi } from "../api/triage-api";
import { triageColumns, triageExportColumns, defaultVisibleColumns } from "../columns";
import type { Triage } from "../types";

const report: ReportDefinition<Triage> = {
  idPrefix: "triage",
  title: "Triaje",
  description: "Consulta los triajes por período de ingreso, sede y empresa.",
  filename: "triaje",
  emptyTitle: "No hay triajes para este período.",
  productLineFilter: false,
  api: triageApi,
  columns: triageColumns,
  exportColumns: triageExportColumns,
  defaultVisibleColumns,
};
export default function TriagePage() {
  return <ReportPage report={report} />;
}
