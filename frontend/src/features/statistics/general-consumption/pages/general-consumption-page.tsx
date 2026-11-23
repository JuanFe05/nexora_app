import { useEffect, useRef, useState } from "react";
import { ExportMenu } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { CartIcon } from "@/icons";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob, ExportError } from "@/lib/table-export";
import { reportError } from "../../shared/report-utils";
import type { ReportFilters as Filters } from "../../shared/types";
import { generalConsumptionApi } from "../api/general-consumption-api";
import { defaultConsumptionColumns, generalConsumptionExportColumns } from "../columns";
import { AnalysisTab } from "../components/analysis-tab";
import { ConsumptionFilters } from "../components/consumption-filters";
import { ConsumptionTable } from "../components/consumption-table";
import type { GeneralConsumptionReport, SerLaboralReport } from "../types";

const TABS = [{ value: "analisis", label: "Análisis" }, { value: "facturas", label: "Facturas Detalladas" }, { value: "admisiones", label: "Admisiones" }, { value: "ser-laboral", label: "Ser Laboral" }] as const;
type State = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "ready"; report: GeneralConsumptionReport };

export default function GeneralConsumptionPage() {
  const [applied, setApplied] = useState<{ filters: Filters; revision: number } | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [serLaboral, setSerLaboral] = useState<SerLaboralReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("analisis");
  const [visible, setVisible] = useState<string[]>(defaultConsumptionColumns);
  const input = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const consulting = state.status === "loading";
  const ready = state.status === "ready";

  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    generalConsumptionApi.fetchReport(applied.filters, controller.signal)
      .then((report) => { if (!controller.signal.aborted) setState({ status: "ready", report }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ status: "error", message: reportError(error) }); });
    return () => controller.abort();
  }, [applied]);
  useEffect(() => () => uploadController.current?.abort(), []);

  function discardUpload() {
    uploadController.current?.abort();
    uploadController.current = null;
    setUploading(false); setUploadError(null); setSerLaboral(null);
    if (input.current) input.current.value = "";
  }
  function consult(filters: Filters) {
    discardUpload(); setTab("analisis"); setVisible(defaultConsumptionColumns);
    setState({ status: "loading" });
    setApplied((current) => ({ filters, revision: (current?.revision ?? 0) + 1 }));
  }
  async function upload(file: File) {
    if (!ready || uploading) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true); setUploadError(null);
    try {
      const result = await generalConsumptionApi.uploadSerLaboral(file, controller.signal);
      if (!controller.signal.aborted) { setSerLaboral(result); setTab("ser-laboral"); }
    } catch (error) {
      if (!controller.signal.aborted) setUploadError(error instanceof ApiError && (error.status === 422 || error.status === 413) ? error.message : "No se pudo cargar el CSV Ser Laboral. Intenta de nuevo.");
    } finally {
      if (uploadController.current === controller) { uploadController.current = null; setUploading(false); }
    }
  }
  const report = state.status === "ready" ? state.report : null;
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<CartIcon />} title="Consumo General" description="Consulta y analiza el consumo de Facturas Detalladas, Admisiones y Ser Laboral en un mismo período." />
      <input ref={input} type="file" accept=".csv" aria-label="Archivo CSV Ser Laboral" hidden disabled={!ready || uploading} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void upload(file);
      }} />
      <ConsumptionFilters consulting={consulting} hasResults={Boolean(applied)} beforeConsult={
        <Button type="button" variant="outline" disabled={!ready || uploading} aria-busy={uploading} onClick={() => input.current?.click()}>
          {uploading && <Spinner aria-hidden="true" role="presentation" />}
          {uploading ? "Cargando CSV…" : "Cargar CSV Ser Laboral"}
        </Button>
      } onConsult={consult} onClear={() => { discardUpload(); setApplied(null); setState({ status: "idle" }); setTab("analisis"); }} />
      {uploadError && <p role="alert" className="text-sm text-error-600 dark:text-error-400">{uploadError}</p>}
      <section aria-label="Exportación de datos unidos" className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Incluye Facturas Detalladas + Admisiones{serLaboral ? " + Ser Laboral" : ""} en un solo archivo.</p>
        <ExportMenu key={applied?.revision ?? "idle"} label="Exportar datos unidos" columns={generalConsumptionExportColumns} visibleIds={visible} disabled={!ready || uploading} exportFile={async (columns, format, signal) => {
          if (!applied) return;
          try {
            const file = await generalConsumptionApi.download(applied.filters, columns, format, signal, serLaboral?.ser_laboral_id);
            if (!signal.aborted) downloadBlob(file, `consumo-general_${applied.filters.startDate}_${applied.filters.endDate}.${format}`);
          } catch (error) {
            if (!signal.aborted && error instanceof ApiError && error.status === 410) {
              setSerLaboral(null);
              throw new ExportError("El archivo de Ser Laboral expiró; cárgalo de nuevo.");
            }
            throw error;
          }
        }} />
      </section>
      {consulting && <Card role="status" aria-live="polite" className="flex items-center gap-3"><Spinner aria-hidden="true" role="presentation" /><span className="text-sm text-gray-500 dark:text-gray-400">Consultando y procesando registros…</span></Card>}
      {state.status === "error" && <Card role="alert" className="space-y-3"><p className="text-sm text-error-600 dark:text-error-400">{state.message}</p><button type="button" onClick={() => { if (applied) consult(applied.filters); }} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">Reintentar</button></Card>}
      {report && <div className="min-w-0 space-y-4">
        {report.advertencias.length > 0 && <div role="status" className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400"><p className="font-medium">Validaciones del procesamiento</p><ul className="mt-1 list-disc pl-5">{report.advertencias.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0">
          <TabsList aria-label="Pestañas de Consumo General">
            {TABS.map(({ value, label }) => <TabsTrigger key={value} value={value}>{label}{value !== "analisis" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{value === "facturas" ? report.total_facturas : value === "admisiones" ? report.total_admisiones : serLaboral?.total ?? 0}</span>}</TabsTrigger>)}
          </TabsList>
          <TabsPanel value="analisis"><AnalysisTab indicators={report.indicadores} /></TabsPanel>
          <TabsPanel value="facturas"><ConsumptionTable title="Facturas Detalladas" rows={report.facturas} visible={visible} onVisibleChange={setVisible} emptyTitle="No hay facturas detalladas para este período." /></TabsPanel>
          <TabsPanel value="admisiones"><ConsumptionTable title="Admisiones" rows={report.admisiones} visible={visible} onVisibleChange={setVisible} emptyTitle="No hay admisiones para este período." /></TabsPanel>
          <TabsPanel value="ser-laboral">
            {serLaboral ? <div className="space-y-4">
              <div role="status" className="text-sm text-gray-600 dark:text-gray-300"><p>Total: {serLaboral.total} · Omitidas: {serLaboral.omitidas}</p>{serLaboral.advertencias.length > 0 && <ul className="mt-2 list-disc pl-5">{serLaboral.advertencias.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}</div>
              <ConsumptionTable key={serLaboral.ser_laboral_id} title="Ser Laboral" rows={serLaboral.filas} visible={visible} onVisibleChange={setVisible} emptyTitle="No hay registros de Ser Laboral." />
            </div> : <Card><p className="text-sm text-gray-500 dark:text-gray-400">Carga un CSV Ser Laboral para ver los registros.</p></Card>}
          </TabsPanel>
        </Tabs>
      </div>}
      {state.status === "idle" && <Card><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2><p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p></Card>}
    </div>
  );
}
