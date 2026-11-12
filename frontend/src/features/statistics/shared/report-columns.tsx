import type { DataTableColumn } from "@/components/shared/data-table";
import type { ExportColumn } from "@/lib/table-export";
import type { ReportCell } from "./types";

export type ColumnType = "text" | "date" | "money" | "number" | "longtext" | "status";
const moneyFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 });
function isEmpty(value: ReportCell | undefined) { return value == null || value === ""; }
export function formatDate(value: ReportCell | undefined) {
  if (isEmpty(value)) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?$/.exec(String(value));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}
function numericValue(value: ReportCell | undefined, formatter: Intl.NumberFormat) {
  if (isEmpty(value)) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? formatter.format(number) : "—";
}
export function formatMoney(value: ReportCell | undefined) { return numericValue(value, moneyFormatter); }
export function formatNumber(value: ReportCell | undefined) { return numericValue(value, numberFormatter); }
function renderCell(value: ReportCell | undefined, type: ColumnType) {
  if (type === "status") {
    if (isEmpty(value)) return null;
    return <span className="block max-w-72 whitespace-normal">{String(value)}</span>;
  }
  if (type === "date") return formatDate(value);
  if (type === "money") return formatMoney(value);
  if (type === "number") return formatNumber(value);
  const text = isEmpty(value) ? "—" : String(value);
  return <span className="block max-w-72 truncate" title={text}>{text}</span>;
}

export function createReportColumns<TKey extends string>(definitions: readonly (readonly [TKey, string, ColumnType])[]): (DataTableColumn<Record<TKey, ReportCell>> & { id: TKey; label: string; type: ColumnType })[] {
  return definitions.map(([id, label, type]) => ({
    id, label, header: label, type,
    className: type === "money" || type === "number" ? "text-right! tabular-nums whitespace-nowrap" : type === "date" ? "whitespace-nowrap" : undefined,
    cell: (row) => renderCell(row[id], type),
  }));
}
export function reportExportColumns(columns: readonly { id: string; type: ColumnType }[]): ExportColumn[] {
  return columns.map(({ id, type }) => ({ id, type: type === "money" || type === "number" ? "number" : type === "date" ? "date" : "text" }));
}
