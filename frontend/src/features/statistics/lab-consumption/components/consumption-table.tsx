import { useState, type ReactNode } from "react";
import { ColumnVisibilityMenu, DataTable, type DataTableColumn } from "@/components/shared/data-table";
const ignoreSearch = () => {};
export function ConsumptionTable<Row>({ title, rows, columns, visible, onVisibleChange, exportAction }: {
  title: string; rows: Row[]; columns: (DataTableColumn<Row> & { label: string })[]; visible: string[]; onVisibleChange: (value: string[]) => void; exportAction: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  return <DataTable compact title={title} columns={columns.filter(({ id }) => visible.includes(id))} rows={pageRows} getRowId={(row) => start + pageRows.indexOf(row)} loading={false} total={rows.length} page={page} pageSize={pageSize} pageSizeOptions={[10, 25, 50, 100]} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} search="" onSearchChange={ignoreSearch} showSearch={false} headerAction={<><ColumnVisibilityMenu columns={columns} value={visible} onChange={onVisibleChange} />{exportAction}</>} emptyState={{ title: `No hay registros de ${title}.`, description: "Prueba con otro período o modifica los filtros." }} />;
}
