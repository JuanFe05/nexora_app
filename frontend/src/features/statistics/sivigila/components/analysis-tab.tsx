import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import type { AnalysisTable, SivigilaReport } from "../types";

const numberFormat = new Intl.NumberFormat("es-CO");
const cell = "border-b border-gray-100 px-3 py-2.5 text-right tabular-nums whitespace-nowrap dark:border-gray-800";

/** Statistical sheet layout: label column, one column per age group and a highlighted Total column. */
export function AnalysisTableView({ table, totalRowIndexes, id }: { table: AnalysisTable; totalRowIndexes?: number[]; id: string }) {
  return (
    <Card className="min-w-0 space-y-4">
      <div className="max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table aria-label={table.titulo} id={id} className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
              <th scope="col" className="sticky left-0 z-10 min-w-56 bg-gray-50 px-3 py-3 text-left text-xs font-semibold tracking-wide uppercase dark:bg-gray-900">{table.titulo}</th>
              {table.columnas.map((column) => <th key={column} scope="col" className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">{column}</th>)}
              <th scope="col" className="bg-brand-50 px-3 py-3 text-right text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">Total</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 dark:text-gray-300">
            {table.filas.map((row, index) => {
              const emphasised = totalRowIndexes?.includes(index);
              return (
                <tr key={row.etiqueta} className={cn(emphasised && "bg-gray-50 font-semibold text-gray-900 dark:bg-white/[0.04] dark:text-white/90")}>
                  <th scope="row" className={cn("sticky left-0 z-10 border-b border-gray-100 px-3 py-2.5 text-left font-medium dark:border-gray-800", emphasised ? "bg-gray-50 dark:bg-gray-900" : "bg-white dark:bg-gray-900")}>{row.etiqueta}</th>
                  {row.valores.map((value, valueIndex) => <td key={table.columnas[valueIndex]} className={cn(cell, value === 0 && !emphasised && "text-gray-400 dark:text-gray-500")}>{numberFormat.format(value)}</td>)}
                  <td className={cn(cell, "bg-brand-50/60 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300")}>{numberFormat.format(row.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AnalysisTab({ report }: { report: SivigilaReport }) {
  return (
    <div className="min-w-0 space-y-6">
      <Card className="text-center">
        <h2 className="text-xl font-bold tracking-wide text-gray-800 dark:text-white/90">{report.titulo}</h2>
        <p className="text-sm font-semibold tracking-wider text-brand-600 dark:text-brand-400">{report.subtitulo}</p>
      </Card>
      {report.advertencias.length > 0 && (
        <div role="status" className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          <p className="font-medium">Validaciones del procesamiento</p>
          <ul className="mt-1 list-disc pl-5">{report.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
      <AnalysisTableView id="sivigila-ira" table={report.ira} />
      <AnalysisTableView id="sivigila-eda" table={report.eda} totalRowIndexes={[report.eda.filas.length - 1]} />
    </div>
  );
}
