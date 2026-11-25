import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { downloadBlob } from "@/lib/table-export";
import { labConsumptionApi } from "../api/lab-consumption-api";
import { formatNumber } from "../../shared/report-columns";
import type { AnnarAnalysis, LabConsumptionRow } from "../types";

type AnalysisTableRow = { codigo: string; descripcion: string; cantidad: number };
function AnalysisTable({ title, codeLabel, rows, empty }: { title: string; codeLabel: string; rows: AnalysisTableRow[]; empty: string }) {
  return <Card className="min-w-0 space-y-3">
    <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
    <div className="custom-scrollbar max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table aria-label={title} className="w-full border-collapse text-sm">
        <thead className="bg-gray-50 text-gray-600 dark:bg-white/[0.03] dark:text-gray-300"><tr><th scope="col" className="px-4 py-3 text-left">{codeLabel}</th><th scope="col" className="px-4 py-3 text-left">Descripción</th><th scope="col" className="px-4 py-3 text-right">Cantidad</th></tr></thead>
        <tbody className="text-gray-700 dark:text-gray-300">{rows.length ? rows.map((row) => <tr key={`${row.codigo}-${row.descripcion}`} className="border-t border-gray-100 dark:border-gray-800"><td className="px-4 py-3">{row.codigo}</td><td className="px-4 py-3">{row.descripcion || "—"}</td><td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.cantidad)}</td></tr>) : <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">{empty}</td></tr>}</tbody>
      </table>
    </div>
  </Card>;
}
export function AnalysisTab({ facturas, admisiones, serLaboral, annar }: { facturas: LabConsumptionRow[]; admisiones: LabConsumptionRow[]; serLaboral: LabConsumptionRow[]; annar: AnnarAnalysis[] }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const aplicativo = useMemo(() => {
    const groups = new Map<string, AnalysisTableRow>();
    for (const rows of [facturas, admisiones, serLaboral]) for (const row of rows) {
      const current = groups.get(row.cdgo_prcdmnto) ?? { codigo: row.cdgo_prcdmnto, descripcion: "", cantidad: 0 };
      current.cantidad += row.cntdd;
      if (!current.descripcion && row.procedimiento.trim()) current.descripcion = row.procedimiento;
      groups.set(row.cdgo_prcdmnto, current);
    }
    return [...groups.values()].sort((a, b) => b.cantidad - a.cantidad);
  }, [facturas, admisiones, serLaboral]);
  async function exportAnalysis() {
    if (controller.current || (!aplicativo.length && !annar.length)) return;
    const abort = new AbortController();
    controller.current = abort;
    setExporting(true); setError(null);
    try {
      const body = {
        aplicativo: aplicativo.map(({ codigo, descripcion, cantidad }) => ({ cups: codigo, descripcion, cantidad })),
        annar: annar.map(({ examen, descripcion, cantidad }) => ({ examen, descripcion, cantidad })),
      };
      const file = await labConsumptionApi.downloadAnalysis(body, abort.signal);
      if (!abort.signal.aborted) downloadBlob(file, "analisis-consumo-laboratorio.xlsx");
    } catch {
      if (!abort.signal.aborted) setError("No se pudo exportar el análisis. Intenta de nuevo.");
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        if (!abort.signal.aborted) setExporting(false);
      }
    }
  }
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button type="button" variant="outline" disabled={exporting || (!aplicativo.length && !annar.length)} aria-busy={exporting} onClick={() => void exportAnalysis()}>
        {exporting && <Spinner aria-hidden="true" role="presentation" />}Exportar a Excel
      </Button>
      {error && <p role="alert" className="w-full text-sm text-error-600 dark:text-error-400">{error}</p>}
    </div>
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <AnalysisTable title="Datos Aplicativo" codeLabel="CUPS" rows={aplicativo} empty="No hay datos del aplicativo para analizar." />
      <AnalysisTable title="Annar Lab" codeLabel="Código Examen" rows={annar.map(({ examen, descripcion, cantidad }) => ({ codigo: examen, descripcion, cantidad }))} empty="Importa un archivo ANNAR LAB para ver el análisis." />
    </div>
  </div>;
}
