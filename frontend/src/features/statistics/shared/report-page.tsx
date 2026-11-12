import { useCallback, useEffect, useState } from "react";
import { ColumnVisibilityMenu, DataTable, ExportMenu, usePagedQuery, type DataTableColumn, type PagedQueryParams } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { ChartBarIcon } from "@/icons";
import { downloadBlob, type ExportColumn } from "@/lib/table-export";
import type { createReportApi } from "./report-api";
import { ReportFilters } from "./report-filters";
import { reportError } from "./report-utils";
import type { ReportFilters as Filters } from "./types";

export type ReportDefinition<TRow> = {
  idPrefix: string;
  title: string;
  description: string;
  filename: string;
  emptyTitle: string;
  api: ReturnType<typeof createReportApi<TRow>>;
  columns: readonly (DataTableColumn<TRow> & { label: string })[];
  exportColumns: readonly ExportColumn[];
  defaultVisibleColumns: string[];
};
const ignoreSearch = () => {};

/** Mounted only on Consultar: draft filters never trigger usePagedQuery. */
function ReportResults<TRow>({ report, filters, visibleColumns, onVisibleColumnsChange, onLoadingChange }: {
  report: ReportDefinition<TRow>;
  filters: Filters;
  visibleColumns: string[];
  onVisibleColumnsChange: (value: string[]) => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const fetcher = useCallback((params: PagedQueryParams) => report.api.fetchPage(filters, params), [report, filters]);
  const query = usePagedQuery({ fetcher, initialPageSize: 10 });
  const { loading } = query;
  useEffect(() => {
    onLoadingChange(loading);
    return () => onLoadingChange(false);
  }, [loading, onLoadingChange]);
  return (
    <DataTable
      compact
      title="Resultados"
      description={query.loading ? "Consultando registros…" : undefined}
      columns={report.columns.filter((column) => visibleColumns.includes(column.id))}
      rows={query.items}
      // These sources have no unique line id; stable server order plus absolute position identifies each read-only row.
      getRowId={(row) => query.items.indexOf(row) + (query.page - 1) * query.pageSize}
      loading={query.loading}
      error={query.error ? { message: reportError(query.error), onRetry: query.reload } : null}
      total={query.total}
      page={query.page}
      pageSize={query.pageSize}
      pageSizeOptions={[10, 25, 50, 100]}
      onPageChange={query.setPage}
      onPageSizeChange={query.setPageSize}
      search=""
      onSearchChange={ignoreSearch}
      showSearch={false}
      headerAction={<>
        <ColumnVisibilityMenu columns={report.columns} value={visibleColumns} onChange={onVisibleColumnsChange} />
        <ExportMenu columns={report.exportColumns} visibleIds={visibleColumns} exportFile={async (columns, format, signal) => {
          const file = await report.api.download(filters, columns, format, signal);
          if (signal.aborted) return;
          downloadBlob(file, `${report.filename}_${filters.startDate}_${filters.endDate}.${format}`);
        }} disabled={query.loading || Boolean(query.error) || query.total === 0} />
      </>}
      emptyState={{ title: report.emptyTitle, description: "Prueba con otro período o modifica los filtros." }}
    />
  );
}

/** Definitions are module-level constants so pagination and catalog fetchers stay stable across renders. */
export function ReportPage<TRow>({ report }: { report: ReportDefinition<TRow> }) {
  const [applied, setApplied] = useState<{ filters: Filters; revision: number } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(report.defaultVisibleColumns);
  const [consulting, setConsulting] = useState(false);
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<ChartBarIcon />} title={report.title} description={report.description} />
      <ReportFilters idPrefix={report.idPrefix} api={report.api} consulting={consulting} hasResults={Boolean(applied)} onConsult={(filters) => setApplied((current) => ({ filters, revision: (current?.revision ?? 0) + 1 }))} onClear={() => setApplied(null)} />
      {applied ? <ReportResults key={applied.revision} report={report} filters={applied.filters} visibleColumns={visibleColumns} onVisibleColumnsChange={setVisibleColumns} onLoadingChange={setConsulting} /> : (
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p>
        </Card>
      )}
    </div>
  );
}
