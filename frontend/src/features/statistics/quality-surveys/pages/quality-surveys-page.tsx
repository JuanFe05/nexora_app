import { useEffect, useRef, useState } from "react";
import { ColumnVisibilityMenu, DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, ChevronDownIcon } from "@/icons";
import { downloadBlob } from "@/lib/table-export";
import { reportExportColumns } from "../../shared/report-columns";
import { ReportFilters } from "../../shared/report-filters";
import { reportError } from "../../shared/report-utils";
import type { ReportFilters as Filters } from "../../shared/types";
import { qualitySurveysApi, type QualitySurveysFormat, type QualitySurveysReport } from "../api/quality-surveys-api";
import { qualitySurveyColumns } from "../columns";

const allColumnIds: string[] = qualitySurveyColumns.map(({ id }) => id);
const columnsById = new Map<string, (typeof qualitySurveyColumns)[number]>(qualitySurveyColumns.map((column) => [column.id, column]));
const formats = [["csv", "CSV"], ["xlsx", "Excel (.xlsx)"]] as const;

type State = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "ready"; report: QualitySurveysReport };

function SurveyResults({ report, filters }: { report: QualitySurveysReport; filters: Filters }) {
  const [visible, setVisible] = useState(allColumnIds);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);

  const columns = visible.flatMap((id) => {
    const column = columnsById.get(id);
    return column ? [column] : [];
  });
  const term = search.trim().toLocaleLowerCase("es");
  const matches = term ? report.rows.filter((row) =>
    qualitySurveyColumns.some(({ id }) => String(row[id] ?? "").toLocaleLowerCase("es").includes(term)),
  ) : report.rows;
  const start = (page - 1) * pageSize;
  const pageRows = matches.slice(start, start + pageSize);

  async function exportData(format: QualitySurveysFormat) {
    if (exportController.current) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError(false);
    try {
      const file = await qualitySurveysApi.download(filters, reportExportColumns(columns), format, controller.signal);
      if (!controller.signal.aborted) {
        downloadBlob(file, `encuestas-de-calidad_${filters.startDate}_${filters.endDate}.${format}`);
      }
    } catch {
      if (!controller.signal.aborted) setExportError(true);
    } finally {
      exportController.current = null;
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  return (
    <DataTable
      compact
      title="Resultados"
      description="La búsqueda solo afecta la tabla. La descarga usa los filtros aplicados y las columnas visibles."
      columns={columns}
      rows={pageRows}
      getRowId={(row) => start + pageRows.indexOf(row)}
      loading={false}
      total={term ? matches.length : report.total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      search={search}
      onSearchChange={(value) => { setSearch(value); setPage(1); }}
      emptyState={{ title: "No hay encuestas de calidad para este período.", description: "Prueba con otro período o modifica los filtros." }}
      headerAction={<>
        <ColumnVisibilityMenu columns={qualitySurveyColumns} value={visible} onChange={setVisible} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" disabled={!report.rows.length || exporting} aria-busy={exporting} />}>
            {exporting ? "Exportando…" : "Exportar"}
            {exporting ? <Spinner aria-hidden="true" role="presentation" /> : <ChevronDownIcon aria-hidden="true" className="size-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {formats.map(([format, label]) => <DropdownMenuItem key={format} onClick={() => void exportData(format)}>{label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        {exportError && <p role="alert" className="w-full text-sm text-error-600 dark:text-error-400">No se pudo exportar la información. Intenta de nuevo.</p>}
      </>}
    />
  );
}

export default function QualitySurveysPage() {
  const [applied, setApplied] = useState<{ filters: Filters } | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const consulting = state.status === "loading";

  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    qualitySurveysApi.fetchReport(applied.filters, controller.signal)
      .then((report) => { if (!controller.signal.aborted) setState({ status: "ready", report }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ status: "error", message: reportError(error) }); });
    return () => controller.abort();
  }, [applied]);

  function consult(filters: Filters) {
    setState({ status: "loading" });
    setApplied({ filters });
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<CheckIcon />} title="Encuestas de Calidad" description="Consulta y exporta los registros de Facturas Detalladas y Admisiones en un mismo período." />
      <ReportFilters idPrefix="quality-surveys" api={qualitySurveysApi} productLineFilter={false} consulting={consulting} hasResults={Boolean(applied)} onConsult={consult} onClear={() => { setApplied(null); setState({ status: "idle" }); }} />
      {state.status === "idle" && <Card><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2><p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p></Card>}
      {consulting && <Card role="status" className="flex items-center gap-3"><Spinner aria-hidden="true" role="presentation" /><span className="text-sm text-gray-500 dark:text-gray-400">Consultando registros…</span></Card>}
      {state.status === "error" && <Card role="alert" className="space-y-3">
        <p className="text-sm text-error-600 dark:text-error-400">{state.message}</p>
        <Button type="button" variant="outline" onClick={() => { if (applied) consult(applied.filters); }}>Reintentar</Button>
      </Card>}
      {state.status === "ready" && applied && <SurveyResults report={state.report} filters={applied.filters} />}
    </div>
  );
}
