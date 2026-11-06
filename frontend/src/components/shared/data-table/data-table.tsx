// Layout adaptado de TailAdmin Free (MIT), table-three/transaction-table.tsx.
import type { Key, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/utils";
import { CardHeader, type DataTableHeaderProps } from "./card-header";
import { CardFooter } from "./card-footer";
import { EmptyState, type EmptyStateText } from "./empty-state";

export type DataTableColumn<TRow> = {
  id: string;
  header: ReactNode;
  cell: (row: TRow) => ReactNode;
  className?: string;
  srOnlyHeader?: boolean;
};
export type DataTableProps<TRow> = Omit<DataTableHeaderProps, "pageSizeOptions"> & {
  pageSizeOptions?: readonly number[];
  columns: readonly DataTableColumn<TRow>[];
  rows: readonly TRow[];
  loading: boolean;
  error?: { message: string; onRetry: () => void } | null;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  rowActions?: (row: TRow) => ReactNode;
  getRowId: (row: TRow) => Key;
  emptyState?: EmptyStateText;
};

export function DataTable<TRow>({ columns, rows, loading, error, total, page, onPageChange, rowActions, getRowId, emptyState = { title: "No hay registros", description: "Los registros aparecerán aquí." }, pageSizeOptions = [10, 25, 50, 100], ...header }: DataTableProps<TRow>) {
  const colSpan = columns.length + (rowActions ? 1 : 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <CardHeader {...header} pageSizeOptions={pageSizeOptions} />
      <div className="w-full overflow-x-auto">
        <Table aria-label={header.title} aria-busy={loading}>
          <TableHeader className="border-y border-gray-100 dark:border-gray-800">
            <TableRow>
              {columns.map(column => <TableCell key={column.id} isHeader className={cn("h-11 px-5 py-3 text-start text-sm font-normal whitespace-nowrap text-gray-500 sm:px-6 dark:text-gray-400", column.className)}><span className={column.srOnlyHeader ? "sr-only" : undefined}>{column.header}</span></TableCell>)}
              {rowActions && <TableCell isHeader className="px-5 py-3 sm:px-6"><span className="sr-only">Acciones</span></TableCell>}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? <TableRow><TableCell colSpan={colSpan} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"><span className="animate-pulse">Cargando registros…</span></TableCell></TableRow>
              : error ? <TableRow><TableCell colSpan={colSpan} className="px-6 py-12 text-center"><div role="alert" className="mb-3 text-sm text-red-500 dark:text-red-400">{error.message}</div><Button type="button" variant="outline" onClick={error.onRetry}>Reintentar</Button></TableCell></TableRow>
              : rows.length === 0 ? <EmptyState colSpan={colSpan} {...(header.search.trim() ? { title: "No se encontraron resultados", description: "Prueba con otra búsqueda." } : emptyState)} />
              : rows.map(row => <TableRow key={getRowId(row)}>
                {columns.map(column => <TableCell key={column.id} className={cn("px-5 py-4 text-sm text-gray-700 sm:px-6 dark:text-gray-300", column.className)}>{column.cell(row)}</TableCell>)}
                {rowActions && <TableCell className="px-5 py-4 sm:px-6"><div className="flex items-center justify-end gap-1">{rowActions(row)}</div></TableCell>}
              </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <CardFooter total={total} page={page} pageSize={header.pageSize} onPageChange={onPageChange} loading={loading} />
    </section>
  );
}
