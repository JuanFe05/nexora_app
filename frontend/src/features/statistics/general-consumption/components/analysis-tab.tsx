import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { downloadBlob } from "@/lib/table-export";
import { generalConsumptionApi } from "../api/general-consumption-api";
import type { ConsumptionIndicator } from "../types";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
type AnalysisFormat = "pdf" | "xlsx";

export function AnalysisTab({ indicators }: { indicators: ConsumptionIndicator[] }) {
  const [exporting, setExporting] = useState<AnalysisFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(format: AnalysisFormat) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setExporting(format);
    try {
      const file = await generalConsumptionApi.exportAnalysis(indicators, format, abort.signal);
      if (!abort.signal.aborted) downloadBlob(file, `consumo-general-analisis.${format}`);
    } catch {
      if (!abort.signal.aborted) setError("No se pudo exportar la información. Intenta de nuevo.");
    } finally {
      if (controller.current === abort && !abort.signal.aborted) {
        controller.current = null;
        setExporting(null);
      }
    }
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Análisis de Facturas Detalladas</h2>
        <div className="flex flex-wrap gap-3">
          {(["pdf", "xlsx"] as const).map((format) => (
            <Button key={format} type="button" variant="outline" disabled={exporting !== null} aria-busy={exporting === format} onClick={() => void run(format)}>
              {exporting === format && <Spinner aria-hidden="true" role="presentation" />}
              {exporting === format ? "Exportando…" : format === "pdf" ? "Exportar PDF" : "Exportar Excel"}
            </Button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-error-600 dark:text-error-400">{error}</p>}
      <Card className="min-w-0">
        <p className="text-sm text-gray-500 dark:text-gray-400">Valores en pesos colombianos (COP), calculados solo con Facturas Detalladas válidas.</p>
        <div className="custom-scrollbar max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table aria-label="Indicadores de consumo general" className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
              <tr><th scope="col" className="px-4 py-3 text-left">Indicador</th><th scope="col" className="px-4 py-3 text-right whitespace-nowrap">Valor (COP)</th></tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {indicators.map((indicator) => (
                <tr key={indicator.clave} className="border-t border-gray-100 dark:border-gray-800">
                  <th scope="row" className="px-4 py-3 text-left font-medium">{indicator.etiqueta}</th>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-brand-700 tabular-nums dark:text-brand-300">{cop.format(indicator.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
