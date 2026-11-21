import { useMemo, useState } from "react";
import { ColumnVisibilityMenu, DataTable, ExportMenu } from "@/components/shared/data-table";
import { downloadBlob } from "@/lib/table-export";
import type { ReportFilters } from "../../shared/types";
import { sivigilaApi } from "../api/sivigila-api";
import { sivigilaColumns, sivigilaExportColumns } from "../columns";
import type { SivigilaEvent, SivigilaRecord } from "../types";

const ignoreSearch = () => {};
const EMPTY: Record<SivigilaEvent, string> = {
  general: "No hay atenciones para este período.",
  ira: "No hay atenciones IRA para este período.",
  eda: "No hay atenciones EDA para este período.",
  dengue: "No hay atenciones de Dengue para este período.",
  varicela: "No hay atenciones de Varicela para este período.",
  rabia: "No hay atenciones de Exposición Rábica para este período.",
};

/** The rows already arrived with the single query; pagination is local and export asks the backend for the tab. */
export function EventTable({ event, rows, filters }: { event: SivigilaEvent; rows: SivigilaRecord[]; filters: ReportFilters }) {
  const columns = useMemo(() => sivigilaColumns(event), [event]);
  const exportColumns = useMemo(() => sivigilaExportColumns(event), [event]);
  const [visible, setVisible] = useState<string[]>(() => columns.map((column) => column.id));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return (
    <DataTable
      compact
      title="Resultados"
      columns={columns.filter((column) => visible.includes(column.id))}
      rows={pageRows}
      getRowId={(row) => start + pageRows.indexOf(row)}
      loading={false}
      total={rows.length}
      page={page}
      pageSize={pageSize}
      pageSizeOptions={[10, 25, 50, 100]}
      onPageChange={setPage}
      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      search=""
      onSearchChange={ignoreSearch}
      showSearch={false}
      headerAction={<>
        <ColumnVisibilityMenu columns={columns} value={visible} onChange={setVisible} />
        <ExportMenu columns={exportColumns} visibleIds={visible} disabled={rows.length === 0} exportFile={async (scope, format, signal) => {
          const file = await sivigilaApi.download(filters, event, scope.map((column) => column.id), format, signal);
          if (signal.aborted) return;
          downloadBlob(file, `notificacion-sivigila-${event}_${filters.startDate}_${filters.endDate}.${format}`);
        }} />
      </>}
      emptyState={{ title: EMPTY[event], description: "Prueba con otro período o modifica los filtros." }}
    />
  );
}
