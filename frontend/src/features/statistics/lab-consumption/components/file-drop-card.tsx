import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, DocumentTextIcon, LoaderCircleIcon, XIcon } from "@/icons";
import { CircleAlertIcon } from "@/icons/circle-alert";
import { UploadIcon } from "@/icons/upload";
import { cn } from "@/utils";

export type FileImportResult =
  | { status: "processing" }
  | { status: "success"; total: number; omitidas?: number; warnings: string[] }
  | { status: "error"; message: string };

export type FileDropCardProps = {
  id: string;
  title: string;
  inputLabel: string;
  accept: ".csv" | ".xls";
  hint: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  result?: FileImportResult;
  resultLabel?: string;
  icon?: ReactNode;
};

function fileSize(bytes: number) {
  const megabytes = bytes >= 1024 * 1024;
  const value = bytes / (megabytes ? 1024 * 1024 : 1024);
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} ${megabytes ? "MB" : "KB"}`;
}

/** A single-file picker; drop and native selection share extension validation. */
export function FileDropCard({ id, title, inputLabel, accept, hint, file, onFileChange, disabled = false, result, resultLabel = title, icon }: FileDropCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const error = validationError ?? (result?.status === "error" ? result.message : undefined);
  const processing = result?.status === "processing";
  const locked = disabled || processing;
  const description = `${id}-hint${error ? ` ${id}-error` : ""}`;

  function select(file?: File) {
    if (locked || !file) return;
    if (!file.name.toLowerCase().endsWith(accept)) {
      setValidationError(`Selecciona un archivo ${accept} para ${title}. El archivo «${file.name}» no es compatible.`);
      return;
    }
    setValidationError(undefined);
    onFileChange(file);
  }

  return (
    <section role="group" aria-labelledby={`${id}-title`} className={cn("min-w-0 space-y-4 rounded-2xl border bg-white p-5 shadow-theme-xs dark:bg-gray-900/40", error ? "border-error-300 dark:border-error-500/50" : "border-gray-200 dark:border-gray-800")}>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400" aria-hidden="true">{icon ?? <DocumentTextIcon className="size-6" />}</span>
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
        </div>
      </div>
      <input ref={inputRef} id={id} type="file" accept={accept} aria-label={inputLabel} aria-describedby={description} aria-invalid={Boolean(error)} disabled={locked} className="sr-only" tabIndex={-1} onChange={(event) => {
        select(event.target.files?.[0]);
        event.target.value = "";
      }} />
      <div
        role="region"
        aria-label={`Zona de carga de ${title}`}
        aria-describedby={description}
        aria-disabled={locked}
        onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files[0]); }}
        className={cn(
          "flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:ring-3 focus-within:ring-brand-500/20",
          locked ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/40" : "hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-500/5",
          !locked && dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : error ? "border-error-300 bg-error-50/40 dark:border-error-500/50 dark:bg-error-500/5" : "border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/20",
        )}
      >
        <UploadIcon aria-hidden="true" className="size-7 text-gray-400 dark:text-gray-500" />
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{dragging && !locked ? "Suelta el archivo aquí" : "Arrastra y suelta tu archivo aquí"}</p>
        <Button type="button" variant="outline" size="sm" disabled={locked} aria-label={`Seleccionar archivo para ${title}`} aria-describedby={description} onClick={() => inputRef.current?.click()}>Seleccionar archivo</Button>
      </div>
      {file && <div className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-brand-400 dark:ring-gray-700">{file.name.split(".").pop()?.toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-gray-800 dark:text-gray-200">{file.name}</p><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{fileSize(file.size)}</p></div>
        <Button type="button" variant="ghost" size="xs" disabled={locked} aria-label={`Quitar ${file.name}`} onClick={() => { setValidationError(undefined); onFileChange(null); if (inputRef.current) inputRef.current.value = ""; }}><XIcon aria-hidden="true" className="size-4" />Quitar</Button>
      </div>}
      {processing && <p role="status" className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400"><LoaderCircleIcon aria-hidden="true" className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />Subiendo y procesando archivo…</p>}
      {result?.status === "success" && <div role="status" className="flex items-start gap-2 rounded-xl bg-success-50 p-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400"><CheckIcon aria-hidden="true" className="size-5 shrink-0" /><div><p>{resultLabel}: {result.total} registros importados.{result.omitidas !== undefined && ` Omitidas: ${result.omitidas}.`}</p>{result.warnings.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4">{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}</div></div>}
      {error && <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-sm text-error-600 dark:text-error-400"><CircleAlertIcon aria-hidden="true" className="size-5 shrink-0" />{error}</p>}
    </section>
  );
}
