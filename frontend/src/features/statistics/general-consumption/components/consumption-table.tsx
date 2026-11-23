import { useState, type ReactNode } from "react";
import { ColumnVisibilityMenu, DataTable } from "@/components/shared/data-table";
import { generalConsumptionColumns } from "../columns";
import type { GeneralConsumptionRow } from "../types";

const ignoreSearch = () => {};

/** Ambas pestañas reutilizan claves, encabezados y celdas, derivando las 40 columnas sin duplicar definiciones. */
export function ConsumptionTable({ title, rows, visible, onVisibleChange, emptyTitle, exportAction }: {
  title: string;
  rows: GeneralConsumptionRow[];
  visible: string[];
  onVisibleChange: (columns: string[]) => void;
  emptyTitle: string;
  /** Se muestra justo después de «Columnas visibles». */
  exportAction?: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return (
    <DataTable
      compact
      title={title}
      columns={generalConsumptionColumns.filter((column) => visible.includes(column.id))}
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
      headerAction={<><ColumnVisibilityMenu columns={generalConsumptionColumns} value={visible} onChange={onVisibleChange} />{exportAction}</>}
      emptyState={{ title: emptyTitle, description: "Prueba con otro período o modifica los filtros." }}
    />
  );
}
