import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentTextIcon, LayoutGridIcon, LoaderCircleIcon } from "@/icons";
import { ApiError } from "@/lib/http/api-error";
import { labConsumptionApi } from "../api/lab-consumption-api";
import type { AnnarLabReport, SerLaboralReport } from "../types";
import { FileDropCard, type FileImportResult } from "./file-drop-card";
/** Each selected file owns its outcome. Successful files aren't resubmitted on partial retries. */
export function ImportDialog({ onClose, controller, onPending, onSerLaboral, onAnnarLab, onSuccess }: {
  onClose: () => void; controller: AbortController; onPending: (pending: boolean) => void;
  onSerLaboral: (result: SerLaboralReport) => void; onAnnarLab: (result: AnnarLabReport) => void; onSuccess: (tab: string) => void;
}) {
  const [ser, setSer] = useState<File | null>(null);
  const [annar, setAnnar] = useState<File | null>(null);
  const [serResult, setSerResult] = useState<FileImportResult>();
  const [annarResult, setAnnarResult] = useState<FileImportResult>();
  const [pending, setPending] = useState(false);
  const canImport = Boolean((ser && serResult?.status !== "success") || (annar && annarResult?.status !== "success"));
  async function submit() {
    if (pending || !canImport || controller.signal.aborted) return;
    setPending(true); onPending(true);
    if (ser && serResult?.status !== "success") setSerResult({ status: "processing" });
    if (annar && annarResult?.status !== "success") setAnnarResult({ status: "processing" });
    const { signal } = controller;
    const jobs: Promise<{ success: boolean; tab: string }>[] = [];
    function failure(error: unknown): FileImportResult {
      return { status: "error", message: error instanceof ApiError ? error.message : "No se pudo importar el archivo. Intenta de nuevo." };
    }
    if (ser && serResult?.status !== "success") jobs.push(labConsumptionApi.uploadSerLaboral(ser, signal).then((result) => {
      if (!signal.aborted) { onSerLaboral(result); setSerResult({ status: "success", total: result.total, omitidas: result.omitidas, warnings: result.advertencias }); }
      return { success: true, tab: "ser-laboral" };
    }).catch((error: unknown) => { if (!signal.aborted) setSerResult(failure(error)); return { success: false, tab: "ser-laboral" }; }));
    if (annar && annarResult?.status !== "success") jobs.push(labConsumptionApi.uploadAnnarLab(annar, signal).then((result) => {
      if (!signal.aborted) { onAnnarLab(result); setAnnarResult({ status: "success", total: result.total, warnings: result.advertencias }); }
      return { success: true, tab: "annar-lab" };
    }).catch((error: unknown) => { if (!signal.aborted) setAnnarResult(failure(error)); return { success: false, tab: "annar-lab" }; }));
    const results = await Promise.all(jobs);
    if (signal.aborted) return;
    setPending(false); onPending(false);
    if (results.length && results.every((result) => result.success)) onSuccess(results[0].tab);
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent aria-busy={pending} showCloseButton={!pending} className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-6 overflow-hidden sm:max-w-4xl">
        <DialogHeader className="gap-2 pr-7">
          <DialogTitle className="text-xl">Importar archivos</DialogTitle>
          <DialogDescription>Selecciona uno o ambos archivos. Cada archivo se procesa por separado.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 overflow-y-auto px-2 py-1">
          <form id="lab-consumption-import" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid items-start gap-5 md:grid-cols-2">
            <FileDropCard id="lab-ser-file" title="CSV de Ser Laboral" inputLabel="CSV Ser Laboral" accept=".csv" hint="Formato aceptado: CSV (.csv)" icon={<DocumentTextIcon className="size-6" />} file={ser} onFileChange={(file) => { setSer(file); setSerResult(undefined); }} disabled={pending} result={serResult} resultLabel="Ser Laboral" />
            <FileDropCard id="lab-annar-file" title="Excel de ANNAR LAB" inputLabel="Excel ANNAR LAB" accept=".xls,.xlsx" hint="Formatos aceptados: Excel 97-2003 (.xls) y Excel moderno (.xlsx)" icon={<LayoutGridIcon className="size-6" />} file={annar} onFileChange={(file) => { setAnnar(file); setAnnarResult(undefined); }} disabled={pending} result={annarResult} resultLabel="ANNAR LAB" />
          </form>
          <p className="mt-4 text-xs leading-5 text-gray-500 dark:text-gray-400">Si un archivo falla, podrás reintentar sin volver a enviar el que ya se importó.</p>
        </div>
        <DialogFooter className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="lab-consumption-import" disabled={pending || !canImport}>{pending && <LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />}{pending ? "Importando…" : "Importar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
