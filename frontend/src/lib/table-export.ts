export type ExportFormat = "csv" | "xlsx" | "both";
export type ExportColumn = {
  /** Original SQL Server column alias; it is written verbatim as the exported header. */
  id: string;
  type: "text" | "number" | "date";
};
export type ExportRow = Record<string, string | number | null | undefined>;

/** A failure whose message is safe to show to the user as is. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

// Semicolon + BOM: Excel with Spanish regional settings opens the file split in columns and in UTF-8.
const CSV_SEPARATOR = ";";
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?$/;

function isEmpty(value: ExportRow[string]) {
  return value == null || value === "";
}

function dateText(value: string) {
  const match = DATE.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function numberOrText(value: string | number) {
  const number = Number(value);
  return typeof value === "number" || Number.isFinite(number) ? number : value;
}

/** Text that a spreadsheet could execute as a formula is neutralized (CSV injection). */
function safeText(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvQuote(text: string) {
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvCell(value: ExportRow[string], type: ExportColumn["type"]) {
  if (isEmpty(value)) return "";
  const text =
    type === "date"
      ? dateText(String(value))
      : type === "number"
        ? String(numberOrText(value as string | number))
        : safeText(String(value));
  return csvQuote(text);
}

export function buildCsv(columns: readonly ExportColumn[], rows: readonly ExportRow[]) {
  const lines = [
    columns.map((column) => csvQuote(column.id)),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.id], column.type))),
  ];
  return `\uFEFF${lines.map((line) => line.join(CSV_SEPARATOR)).join("\r\n")}\r\n`;
}

export async function buildXlsx(columns: readonly ExportColumn[], rows: readonly ExportRow[]) {
  // Loaded on demand: the spreadsheet writer is only needed when exporting.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = columns.map((column) => ({ value: column.id, fontWeight: "bold" as const }));
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = row[column.id];
      if (isEmpty(value)) return null;
      if (column.type === "date") return dateText(String(value));
      if (column.type === "number") return numberOrText(value as string | number);
      return String(value);
    }),
  );
  return writeXlsxFile([header, ...body], {
    columns: columns.map((column) => ({ width: Math.min(40, Math.max(12, column.id.length + 2)) })),
    stickyRowsCount: 1,
  }).toBlob();
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportRows({
  columns,
  rows,
  format,
  fileName,
}: {
  columns: readonly ExportColumn[];
  rows: readonly ExportRow[];
  format: ExportFormat;
  fileName: string;
}) {
  if (format !== "xlsx") {
    downloadBlob(new Blob([buildCsv(columns, rows)], { type: "text/csv;charset=utf-8" }), `${fileName}.csv`);
  }
  if (format !== "csv") {
    downloadBlob(await buildXlsx(columns, rows), `${fileName}.xlsx`);
  }
}
