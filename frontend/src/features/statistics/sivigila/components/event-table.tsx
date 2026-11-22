import { useMemo, useState } from "react";
import { ColumnVisibilityMenu, DataTable } from "@/components/shared/data-table";
import { sivigilaColumns } from "../columns";
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

/** Las filas ya llegaron con la consulta única; la paginación es local y la exportación está en la pestaña Análisis. */
export function EventTable({ event, rows }: { event: SivigilaEvent; rows: SivigilaRecord[] }) {
  const columns = useMemo(() => sivigilaColumns(event), [event]);
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
      headerAction={<ColumnVisibilityMenu columns={columns} value={visible} onChange={setVisible} />}
      emptyState={{ title: EMPTY[event], description: "Prueba con otro período o modifica los filtros." }}
    />
  );
}
