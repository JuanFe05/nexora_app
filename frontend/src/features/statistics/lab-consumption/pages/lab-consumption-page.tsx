import { useEffect, useRef, useState } from "react";
import { ExportMenu } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { FlaskIcon } from "@/icons";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob, ExportError, type ExportColumn, type ExportFormat } from "@/lib/table-export";
import { reportError } from "../../shared/report-utils";
import type { ReportFilters } from "../../shared/types";
import { labConsumptionApi } from "../api/lab-consumption-api";
import { annarColumns, defaultAnnarColumns, defaultLabColumns, labColumns, labExportColumns } from "../columns";
import { AnalysisTab } from "../components/analysis-tab";
import { ConsumptionFilters } from "../components/consumption-filters";
import { ConsumptionTable } from "../components/consumption-table";
import { ImportDialog } from "../components/import-dialog";
import type { AnnarLabReport, LabConsumptionReport, SerLaboralReport } from "../types";
const TABS = [{ value: "analisis", label: "Análisis" }, { value: "facturas", label: "Facturas Detalladas" }, { value: "admisiones", label: "Admisiones" }, { value: "ser-laboral", label: "Ser Laboral" }, { value: "annar-lab", label: "Annar Lab" }];
type State = { status: "idle" | "loading" | "ready" } | { status: "error"; message: string };
export default function LabConsumptionPage() {
  const [applied, setApplied] = useState<{ filters: ReportFilters; revision: number } | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [report, setReport] = useState<LabConsumptionReport | null>(null);
  const [serLaboral, setSerLaboral] = useState<SerLaboralReport | null>(null);
  const [annarLab, setAnnarLab] = useState<AnnarLabReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importController, setImportController] = useState<AbortController | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tab, setTab] = useState("analisis");
  const [visible, setVisible] = useState<string[]>(defaultLabColumns);
  const [annarVisible, setAnnarVisible] = useState<string[]>(defaultAnnarColumns);
  const ready = state.status === "ready";
  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    labConsumptionApi.fetchReport(applied.filters, controller.signal)
      .then((report) => { if (!controller.signal.aborted) { setReport(report); setState({ status: "ready" }); } })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ status: "error", message: reportError(error) }); });
    return () => controller.abort();
  }, [applied]);
  useEffect(() => () => uploadController.current?.abort(), []);
  function closeImport() {
    uploadController.current?.abort(); uploadController.current = null;
    setImportController(null); setUploading(false);
  }
  function discardImports() { closeImport(); setSerLaboral(null); setAnnarLab(null); setUploadError(null); }
  function consult(filters: ReportFilters) {
    // A query replaces only application results; successful imports keep their own lifecycle.
    closeImport(); setUploadError(null);
    setTab("analisis"); setVisible(defaultLabColumns); setAnnarVisible(defaultAnnarColumns);
    setState({ status: "loading" });
    setApplied((current) => ({ filters, revision: (current?.revision ?? 0) + 1 }));
  }
  async function exportData(columns: readonly ExportColumn[], format: ExportFormat, signal: AbortSignal) {
    if (!applied) return;
    try {
      const tokens = { serLaboralId: serLaboral?.ser_laboral_id, annarLabId: annarLab?.annar_lab_id };
      const { file, name } = await labConsumptionApi.download(applied.filters, columns, format, signal, tokens);
      if (!signal.aborted) downloadBlob(file, name);
    } catch (error) {
      if (!signal.aborted && error instanceof ApiError && error.status === 410) {
        // A grouped export can reference either token; the response need not identify the expired one.
        setSerLaboral(null); setAnnarLab(null);
        const message = "Un archivo importado expiró; cárgalo de nuevo. Vuelve a importar Ser Laboral y ANNAR LAB.";
        setUploadError(message); throw new ExportError(message);
      }
      throw error;
    }
  }
  function tableExport(count: number) {
    return <ExportMenu label="Exportar" columns={labExportColumns} visibleIds={visible} disabled={!ready || uploading || count === 0} exportFile={exportData} />;
  }
  const hasResults = Boolean(report || serLaboral || annarLab);
  const facturas = report?.facturas ?? [];
  const admisiones = report?.admisiones ?? [];
  return <div className="min-w-0 space-y-6">
    <PageHeader icon={<FlaskIcon />} title="Consumo de Laboratorio" description="Consulta y analiza el consumo de laboratorio del aplicativo, Ser Laboral y ANNAR LAB." />
    <ConsumptionFilters consulting={state.status === "loading"} hasResults={Boolean(applied) || hasResults} beforeConsult={<Button type="button" className="min-w-36" onClick={() => { if (uploading) return; const controller = new AbortController(); uploadController.current = controller; setImportController(controller); }}>Importar archivos</Button>} onConsult={consult} onClear={() => { discardImports(); setApplied(null); setReport(null); setState({ status: "idle" }); setTab("analisis"); }} />
    {importController && <ImportDialog controller={importController} onClose={closeImport} onPending={setUploading} onSerLaboral={(result) => { setSerLaboral(result); setTab("ser-laboral"); }} onAnnarLab={(result) => { setAnnarLab(result); setTab("annar-lab"); }} onSuccess={(value) => { closeImport(); setTab(value); setUploadError(null); }} />}
    {uploadError && <p role="alert" className="text-sm text-error-600 dark:text-error-400">{uploadError}</p>}
    {ready && <section aria-label="Exportación de datos unidos" className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
      <ExportMenu key={applied?.revision ?? "idle"} label="Exportar datos unidos" columns={labExportColumns} visibleIds={visible} disabled={!ready || uploading} exportFile={exportData} />
    </section>}
    {state.status === "loading" && <Card role="status" className="flex items-center gap-3"><Spinner aria-hidden="true" role="presentation" /><span className="text-sm text-gray-500 dark:text-gray-400">Consultando y procesando registros…</span></Card>}
    {state.status === "error" && <Card role="alert" className="space-y-3"><p className="text-sm text-error-600 dark:text-error-400">{state.message}</p><Button variant="outline" onClick={() => { if (applied) consult(applied.filters); }}>Reintentar</Button></Card>}
    {hasResults && <div className="min-w-0 space-y-4">
      {report && report.advertencias.length > 0 && <div role="status" className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400"><ul className="list-disc pl-5">{report.advertencias.map((warning, i) => <li key={`${i}-${warning}`}>{warning}</li>)}</ul></div>}
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0">
        <TabsList aria-label="Pestañas de Consumo de Laboratorio">{TABS.map(({ value, label }) => <TabsTrigger key={value} value={value}>{label}{value !== "analisis" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{value === "facturas" ? report?.total_facturas ?? 0 : value === "admisiones" ? report?.total_admisiones ?? 0 : value === "ser-laboral" ? serLaboral?.total ?? 0 : annarLab?.total ?? 0}</span>}</TabsTrigger>)}</TabsList>
        <TabsPanel value="analisis"><AnalysisTab facturas={facturas} admisiones={admisiones} serLaboral={serLaboral?.filas ?? []} annar={annarLab?.analisis_annar ?? []} /></TabsPanel>
        <TabsPanel value="facturas"><ConsumptionTable key={`facturas-${applied?.revision}`} title="Facturas Detalladas" rows={facturas} columns={labColumns} visible={visible} onVisibleChange={setVisible} exportAction={tableExport(facturas.length)} /></TabsPanel>
        <TabsPanel value="admisiones"><ConsumptionTable key={`admisiones-${applied?.revision}`} title="Admisiones" rows={admisiones} columns={labColumns} visible={visible} onVisibleChange={setVisible} exportAction={tableExport(admisiones.length)} /></TabsPanel>
        <TabsPanel value="ser-laboral">{serLaboral ? <div className="space-y-4"><div role="status" className="text-sm text-gray-600 dark:text-gray-300"><p>Total: {serLaboral.total} · Omitidas: {serLaboral.omitidas}</p>{serLaboral.advertencias.map((warning, i) => <p key={`${i}-${warning}`}>{warning}</p>)}</div><ConsumptionTable key={serLaboral.ser_laboral_id} title="Ser Laboral" rows={serLaboral.filas} columns={labColumns} visible={visible} onVisibleChange={setVisible} exportAction={tableExport(serLaboral.filas.length)} /></div> : <Card><p className="text-sm text-gray-500 dark:text-gray-400">Importa un CSV Ser Laboral para ver los registros.</p></Card>}</TabsPanel>
        <TabsPanel value="annar-lab">{annarLab ? <div className="space-y-4"><div role="status" className="text-sm text-gray-600 dark:text-gray-300"><p>Total: {annarLab.total}</p>{annarLab.advertencias.map((warning, i) => <p key={`${i}-${warning}`}>{warning}</p>)}</div><ConsumptionTable key={annarLab.annar_lab_id} title="Annar Lab" rows={annarLab.filas} columns={annarColumns} visible={annarVisible} onVisibleChange={setAnnarVisible} exportAction={tableExport(annarLab.filas.length)} /></div> : <Card><p className="text-sm text-gray-500 dark:text-gray-400">Importa un archivo ANNAR LAB para ver los registros.</p></Card>}</TabsPanel>
      </Tabs>
    </div>}
    {state.status === "idle" && !hasResults && <Card><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2><p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p></Card>}
  </div>;
}
