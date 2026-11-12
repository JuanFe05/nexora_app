/** One file per operation: the backend streams the export, so the client only picks the format. */
export type ExportFormat = "csv" | "xlsx";
export type ExportColumn = {
  /** Original SQL Server column alias; it is written verbatim as the exported header. */
  id: string;
  type: "text" | "number" | "date";
};

/** A failure whose message is safe to show to the user as is. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
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
