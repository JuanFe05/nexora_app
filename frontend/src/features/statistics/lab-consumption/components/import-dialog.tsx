import { useState } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { ApiError } from "@/lib/http/api-error";
import { labConsumptionApi } from "../api/lab-consumption-api";
import type { AnnarLabReport, SerLaboralReport } from "../types";
type Result = { status: "success"; total: number; omitidas?: number; warnings: string[] } | { status: "error"; message: string };
function ResultMessage({ result, label }: { result?: Result; label: string }) {
  if (!result) return null;
  if (result.status === "error") return <p role="alert" className="text-sm text-error-600 dark:text-error-400">{result.message}</p>;
  return <div role="status" className="text-sm text-gray-600 dark:text-gray-300"><p>{label}: {result.total} registros importados.{result.omitidas !== undefined && ` Omitidas: ${result.omitidas}.`}</p>{result.warnings.length > 0 && <ul className="list-disc pl-5">{result.warnings.map((warning, i) => <li key={`${i}-${warning}`}>{warning}</li>)}</ul>}</div>;
}
/** Each selected file owns its outcome. Successful files aren't resubmitted on partial retries. */
export function ImportDialog({ onClose, controller, onPending, onSerLaboral, onAnnarLab, onSuccess }: {
  onClose: () => void; controller: AbortController; onPending: (pending: boolean) => void;
  onSerLaboral: (result: SerLaboralReport) => void; onAnnarLab: (result: AnnarLabReport) => void; onSuccess: (tab: string) => void;
}) {
  const [ser, setSer] = useState<File | null>(null);
  const [annar, setAnnar] = useState<File | null>(null);
  const [serResult, setSerResult] = useState<Result>();
  const [annarResult, setAnnarResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit() {
    if (pending) return;
    if (!ser && !annar) { setError("Selecciona al menos un archivo."); return; }
    setError(undefined); setPending(true); onPending(true);
    const { signal } = controller;
    const jobs: Promise<{ success: boolean; tab: string }>[] = [];
    function failure(error: unknown): Result {
      return { status: "error", message: error instanceof ApiError && (error.status === 422 || error.status === 413) ? error.message : "No se pudo importar el archivo. Intenta de nuevo." };
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
  return <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Importar archivos" description="Selecciona uno o ambos archivos. Cada archivo se procesa por separado." formId="lab-consumption-import" submitLabel="Importar" pendingLabel="Importando…" pending={pending}>
    <form id="lab-consumption-import" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-5">
      <div className="space-y-2"><label htmlFor="lab-ser-file" className="block text-sm font-medium text-gray-700 dark:text-gray-300">CSV Ser Laboral</label><input id="lab-ser-file" type="file" accept=".csv" disabled={pending} className="block w-full text-sm text-gray-700 dark:text-gray-300" onChange={(event) => { setSer(event.target.files?.[0] ?? null); setSerResult(undefined); }} /><ResultMessage result={serResult} label="Ser Laboral" /></div>
      <div className="space-y-2"><label htmlFor="lab-annar-file" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Excel ANNAR LAB</label><input id="lab-annar-file" type="file" accept=".xls" disabled={pending} className="block w-full text-sm text-gray-700 dark:text-gray-300" onChange={(event) => { setAnnar(event.target.files?.[0] ?? null); setAnnarResult(undefined); }} /><ResultMessage result={annarResult} label="ANNAR LAB" /></div>
      {error && <p role="alert" className="text-sm text-error-600 dark:text-error-400">{error}</p>}
    </form>
  </FormDialog>;
}
