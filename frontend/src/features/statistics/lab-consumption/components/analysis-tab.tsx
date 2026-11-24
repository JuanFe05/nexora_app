import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatNumber } from "../../shared/report-columns";
import type { AnnarAnalysis, LabConsumptionRow } from "../types";

function AnalysisTable({ title, codeLabel, rows, empty }: { title: string; codeLabel: string; rows: AnnarAnalysis[]; empty: string }) {
  return <Card className="min-w-0 space-y-3">
    <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
    <div className="custom-scrollbar max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table aria-label={title} className="w-full border-collapse text-sm">
        <thead className="bg-gray-50 text-gray-600 dark:bg-white/[0.03] dark:text-gray-300"><tr><th scope="col" className="px-4 py-3 text-left">{codeLabel}</th><th scope="col" className="px-4 py-3 text-left">Descripción</th><th scope="col" className="px-4 py-3 text-right">Cantidad</th></tr></thead>
        <tbody className="text-gray-700 dark:text-gray-300">{rows.length ? rows.map((row) => <tr key={`${row.seccion}-${row.descripcion}`} className="border-t border-gray-100 dark:border-gray-800"><td className="px-4 py-3">{row.seccion}</td><td className="px-4 py-3">{row.descripcion || "—"}</td><td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.cantidad)}</td></tr>) : <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">{empty}</td></tr>}</tbody>
      </table>
    </div>
  </Card>;
}
export function AnalysisTab({ facturas, admisiones, serLaboral, annar }: { facturas: LabConsumptionRow[]; admisiones: LabConsumptionRow[]; serLaboral: LabConsumptionRow[]; annar: AnnarAnalysis[] }) {
  const aplicativo = useMemo(() => {
    const groups = new Map<string, AnnarAnalysis>();
    for (const rows of [facturas, admisiones, serLaboral]) for (const row of rows) {
      const current = groups.get(row.cdgo_prcdmnto) ?? { seccion: row.cdgo_prcdmnto, descripcion: "", cantidad: 0 };
      current.cantidad += row.cntdd;
      if (!current.descripcion && row.procedimiento.trim()) current.descripcion = row.procedimiento;
      groups.set(row.cdgo_prcdmnto, current);
    }
    return [...groups.values()].sort((a, b) => b.cantidad - a.cantidad);
  }, [facturas, admisiones, serLaboral]);
  return <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
    <AnalysisTable title="Datos Aplicativo" codeLabel="CUPS" rows={aplicativo} empty="No hay datos del aplicativo para analizar." />
    <AnalysisTable title="Annar Lab" codeLabel="Código Sección" rows={annar} empty="Importa un archivo ANNAR LAB para ver el análisis." />
  </div>;
}
