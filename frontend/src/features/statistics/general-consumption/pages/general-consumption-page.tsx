import { useCallback, useEffect, useState } from "react";
import { ExportMenu } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { CartIcon } from "@/icons";
import { downloadBlob } from "@/lib/table-export";
import { ReportFilters } from "../../shared/report-filters";
import { reportError } from "../../shared/report-utils";
import type { ReportFilters as Filters } from "../../shared/types";
import { generalConsumptionApi } from "../api/general-consumption-api";
import { defaultConsumptionColumns, generalConsumptionExportColumns } from "../columns";
import { AnalysisTab } from "../components/analysis-tab";
import { ConsumptionTable } from "../components/consumption-table";
import type { GeneralConsumptionReport } from "../types";

const TABS = [{ value: "analisis", label: "Análisis" }, { value: "facturas", label: "Facturas Detalladas" }, { value: "admisiones", label: "Admisiones" }] as const;
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; report: GeneralConsumptionReport };

/** La consulta única entrega ambas fuentes y sus indicadores; pestañas, columnas y páginas son locales. */
function ConsumptionResults({ filters, onLoadingChange }: { filters: Filters; onLoadingChange: (loading: boolean) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<string>("analisis");
  const [visible, setVisible] = useState<string[]>(defaultConsumptionColumns);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => { setState({ status: "loading" }); setRevision((value) => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    generalConsumptionApi.fetchReport(filters, controller.signal)
      .then((report) => { if (!controller.signal.aborted) setState({ status: "ready", report }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ status: "error", message: reportError(error) }); });
    return () => controller.abort();
  }, [filters, revision]);
  const loading = state.status === "loading";
  useEffect(() => {
    onLoadingChange(loading);
    return () => onLoadingChange(false);
  }, [loading, onLoadingChange]);

  if (state.status === "loading") return (
    <Card role="status" aria-live="polite" className="flex items-center gap-3">
      <Spinner aria-hidden="true" role="presentation" />
      <span className="text-sm text-gray-500 dark:text-gray-400">Consultando y procesando registros…</span>
    </Card>
  );
  if (state.status === "error") return (
    <Card role="alert" className="space-y-3">
      <p className="text-sm text-error-600 dark:text-error-400">{state.message}</p>
      <button type="button" onClick={retry} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">Reintentar</button>
    </Card>
  );
  const { report } = state;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Exportar datos: Facturas Detalladas + Admisiones en un solo archivo.</p>
        <ExportMenu columns={generalConsumptionExportColumns} visibleIds={visible} disabled={report.total_facturas + report.total_admisiones === 0} exportFile={async (columns, format, signal) => {
          const file = await generalConsumptionApi.download(filters, columns, format, signal);
          if (!signal.aborted) downloadBlob(file, `consumo-general_${filters.startDate}_${filters.endDate}.${format}`);
        }} />
      </div>
      {report.advertencias.length > 0 && (
        <div role="status" className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          <p className="font-medium">Validaciones del procesamiento</p>
          <ul className="mt-1 list-disc pl-5">{report.advertencias.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
        </div>
      )}
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0">
        <TabsList aria-label="Pestañas de Consumo General">
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
              {value !== "analisis" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{value === "facturas" ? report.total_facturas : report.total_admisiones}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsPanel value="analisis"><AnalysisTab indicators={report.indicadores} /></TabsPanel>
        <TabsPanel value="facturas"><ConsumptionTable title="Facturas Detalladas" rows={report.facturas} visible={visible} onVisibleChange={setVisible} emptyTitle="No hay facturas detalladas para este período." /></TabsPanel>
        <TabsPanel value="admisiones"><ConsumptionTable title="Admisiones" rows={report.admisiones} visible={visible} onVisibleChange={setVisible} emptyTitle="No hay admisiones para este período." /></TabsPanel>
      </Tabs>
    </div>
  );
}

export default function GeneralConsumptionPage() {
  const [applied, setApplied] = useState<{ filters: Filters; revision: number } | null>(null);
  const [consulting, setConsulting] = useState(false);
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<CartIcon />} title="Consumo General" description="Consulta y analiza el consumo de Facturas Detalladas y Admisiones en un mismo período." />
      <ReportFilters idPrefix="general-consumption" api={generalConsumptionApi} consulting={consulting} hasResults={Boolean(applied)} onConsult={(filters) => setApplied((current) => ({ filters, revision: (current?.revision ?? 0) + 1 }))} onClear={() => setApplied(null)} />
      {applied ? <ConsumptionResults key={applied.revision} filters={applied.filters} onLoadingChange={setConsulting} /> : (
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p>
        </Card>
      )}
    </div>
  );
}
