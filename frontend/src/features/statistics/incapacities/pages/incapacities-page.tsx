import { useCallback, useEffect, useState } from "react";
import { ColumnVisibilityMenu, DataTable, ExportMenu, usePagedQuery, type PagedQueryParams } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { ChartBarIcon } from "@/icons";
import { downloadBlob } from "@/lib/table-export";
import { reportError } from "../../shared/report-utils";
import type { ReportFilters } from "../../shared/types";
import { incapacitiesApi as api } from "../api/incapacities-api";
import { columns, exportColumns } from "../columns";
import { IncapacityFilters } from "../components/incapacity-filters";

type ResultsProps = {
  filters: ReportFilters;
  visibleColumns: string[];
  onVisibleColumnsChange: (value: string[]) => void;
  onLoadingChange: (loading: boolean) => void;
};

function IncapacityResults({ filters, visibleColumns, onVisibleColumnsChange, onLoadingChange }: ResultsProps) {
  const fetcher = useCallback((params: PagedQueryParams) => api.fetchPage(filters, params), [filters]);
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
      description={loading ? "Consultando registros…" : undefined}
      columns={columns.filter(({ id }) => visibleColumns.includes(id))}
      rows={query.items}
      getRowId={(row) => query.items.indexOf(row) + (query.page - 1) * query.pageSize}
      loading={loading}
      error={query.error ? { message: reportError(query.error), onRetry: query.reload } : null}
      total={query.total}
      page={query.page}
      pageSize={query.pageSize}
      onPageChange={query.setPage}
      onPageSizeChange={query.setPageSize}
      search={query.search}
      onSearchChange={query.setSearch}
      headerAction={<>
        <ColumnVisibilityMenu columns={columns} value={visibleColumns} onChange={onVisibleColumnsChange} />
        <ExportMenu
          formats={[
            { format: "csv", label: "CSV" },
            { format: "xlsx", label: "Excel (.xlsx)" },
            { format: "txt", label: "Texto (.txt)" },
          ]}
          columns={exportColumns}
          visibleIds={visibleColumns}
          // Loading also covers the debounce interval, so enabled exports use the term applied to the results.
          disabled={loading || Boolean(query.error) || query.total === 0}
          exportFile={async (selected, format, signal) => {
            const file = await api.download(filters, query.search, selected, format, signal);
            if (signal.aborted) return;
            downloadBlob(file, `incapacidades_${filters.startDate}_${filters.endDate}.${format}`);
          }}
        />
      </>}
      emptyState={{ title: "No hay incapacidades para este período.", description: "Prueba con otro período o modifica los filtros." }}
    />
  );
}

export default function IncapacitiesPage() {
  const [applied, setApplied] = useState<{ filters: ReportFilters; revision: number } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState(() => columns.map(({ id }) => id));
  const [consulting, setConsulting] = useState(false);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<ChartBarIcon />} title="Gestión de Incapacidades" description="Consulta las incapacidades por fecha de inicio y empresa." />
      <IncapacityFilters
        fetchCompanies={api.fetchCompanies}
        consulting={consulting}
        hasResults={Boolean(applied)}
        onConsult={(filters) => setApplied((current) => ({ filters, revision: (current?.revision ?? 0) + 1 }))}
        onClear={() => setApplied(null)}
      />
      {applied ? (
        <IncapacityResults
          key={applied.revision}
          filters={applied.filters}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={setVisibleColumns}
          onLoadingChange={setConsulting}
        />
      ) : (
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Resultados</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona un período y presiona Consultar.</p>
        </Card>
      )}
    </div>
  );
}
