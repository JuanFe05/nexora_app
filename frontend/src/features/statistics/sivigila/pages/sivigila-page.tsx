import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { PulseIcon } from "@/icons";
import { ReportFilters } from "../../shared/report-filters";
import { reportError } from "../../shared/report-utils";
import type { ReportFilters as Filters } from "../../shared/types";
import { sivigilaApi } from "../api/sivigila-api";
import { AnalysisTab } from "../components/analysis-tab";
import { EventTable } from "../components/event-table";
import type { SivigilaEvent, SivigilaReport } from "../types";

const TABS: readonly { value: "analisis" | SivigilaEvent; label: string }[] = [
  { value: "analisis", label: "Análisis" },
  { value: "general", label: "General" },
  { value: "ira", label: "Evento IRA" },
  { value: "eda", label: "Evento EDA" },
  { value: "dengue", label: "Dengue" },
  { value: "varicela", label: "Varicela" },
  { value: "rabia", label: "Exposición Rábica" },
];

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; report: SivigilaReport };

/** Se monta al consultar: una solicitud alimenta todas las pestañas, así que cambiar de pestaña no vuelve a consultar. */
function SivigilaResults({ filters, onLoadingChange }: { filters: Filters; onLoadingChange: (loading: boolean) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [tab, setTab] = useState<string>("analisis");
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => { setState({ status: "loading" }); setRevision((value) => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    sivigilaApi.fetchReport(filters, controller.signal)
      .then((report) => setState({ status: "ready", report }))
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
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0">
      <TabsList aria-label="Pestañas de Notificación SIVIGILA">
        {TABS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value}>
            {label}
            {value !== "analisis" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{report.pestanas[value].length}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map(({ value }) => (
        <TabsPanel key={value} value={value}>
          {value === "analisis" ? <AnalysisTab report={report} /> : <EventTable event={value} rows={report.pestanas[value]} />}
        </TabsPanel>
      ))}
    </Tabs>
  );
}

export default function SivigilaPage() {
  const [applied, setApplied] = useState<{ filters: Filters; revision: number } | null>(null);
  const [consulting, setConsulting] = useState(false);
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<PulseIcon />} title="Notificación SIVIGILA" description="Procesa las atenciones del período y clasifica los eventos IRA, EDA, Dengue, Varicela y Exposición Rábica." />
      <ReportFilters idPrefix="sivigila" api={sivigilaApi} consulting={consulting} hasResults={Boolean(applied)} onConsult={(filters) => setApplied((current) => ({ filters, revision: (current?.revision ?? 0) + 1 }))} onClear={() => setApplied(null)} />
      {applied ? <SivigilaResults key={applied.revision} filters={applied.filters} onLoadingChange={setConsulting} /> : (
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p>
        </Card>
      )}
    </div>
  );
}
