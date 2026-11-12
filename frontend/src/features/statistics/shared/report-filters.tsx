import { useState } from "react";
import { DateField } from "@/components/shared/date-field";
import { MultiSelect, type MultiSelectValue } from "@/components/shared/multi-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { restrictedIds } from "./report-utils";
import type { ReportFilters as Filters } from "./types";
import { useCatalog } from "./use-catalog";
import type { createReportApi } from "./report-api";

type CatalogApi = Pick<ReturnType<typeof createReportApi>, "fetchSites" | "fetchCompanies" | "fetchProductLines">;
export function ReportFilters({ idPrefix, api, consulting, hasResults, onConsult, onClear }: {
  idPrefix: string;
  api: CatalogApi;
  consulting: boolean;
  hasResults: boolean;
  onConsult: (filters: Filters) => void;
  onClear: () => void;
}) {
  const sites = useCatalog(api.fetchSites, "No se pudieron cargar las sedes.");
  const companies = useCatalog(api.fetchCompanies, "No se pudieron cargar las empresas.");
  const productLines = useCatalog(api.fetchProductLines, "No se pudieron cargar las líneas de producto.");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedSites, setSelectedSites] = useState<MultiSelectValue[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<MultiSelectValue[]>([]);
  const [selectedProductLines, setSelectedProductLines] = useState<MultiSelectValue[]>([]);
  const [errors, setErrors] = useState<{ startDate?: string; endDate?: string }>({});
  const catalogsUnavailable = sites.loading || companies.loading || productLines.loading || Boolean(sites.error || companies.error || productLines.error);
  const nothingToClear = !startDate && !endDate && !selectedSites.length && !selectedCompanies.length && !selectedProductLines.length && !errors.startDate && !errors.endDate && !hasResults;

  function consult() {
    const nextErrors = {
      startDate: !startDate
        ? "La fecha inicial es obligatoria."
        : endDate && startDate > endDate
          ? "La fecha inicial no puede ser posterior a la fecha final."
          : undefined,
      endDate: !endDate ? "La fecha final es obligatoria." : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.startDate || nextErrors.endDate || catalogsUnavailable || consulting) return;
    onConsult({ startDate, endDate, sites: restrictedIds(selectedSites, sites.items), companies: restrictedIds(selectedCompanies, companies.items), productLines: restrictedIds(selectedProductLines, productLines.items) });
  }
  function clear() {
    setStartDate("");
    setEndDate("");
    setSelectedSites([]);
    setSelectedCompanies([]);
    setSelectedProductLines([]);
    setErrors({});
    onClear();
  }
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Filtros de consulta</h2>
      <form noValidate onSubmit={(event) => { event.preventDefault(); consult(); }} className="space-y-5">
        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <DateField id={`${idPrefix}-start-date`} label="Fecha inicial" value={startDate} onChange={setStartDate} required maxDate="today" error={errors.startDate} />
          <DateField id={`${idPrefix}-end-date`} label="Fecha final" value={endDate} onChange={setEndDate} required maxDate="today" error={errors.endDate} />
          <MultiSelect id={`${idPrefix}-sites`} label="Sede" placeholder="Seleccionar sedes" options={sites.items.map((item) => ({ value: item.id, label: item.nombre }))} value={selectedSites} onChange={setSelectedSites} loading={sites.loading} error={sites.error} onRetry={sites.retry} />
          <MultiSelect id={`${idPrefix}-companies`} label="Empresa" placeholder="Seleccionar empresas" searchable options={companies.items.map((item) => ({ value: item.id, label: item.nombre }))} value={selectedCompanies} onChange={setSelectedCompanies} loading={companies.loading} error={companies.error} onRetry={companies.retry} />
          <MultiSelect id={`${idPrefix}-product-lines`} label="Línea de Producto" placeholder="Seleccionar líneas de producto" searchable options={productLines.items.map((item) => ({ value: item.id, label: item.nombre }))} value={selectedProductLines} onChange={setSelectedProductLines} loading={productLines.loading} error={productLines.error} onRetry={productLines.retry} />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={clear} disabled={nothingToClear}>Limpiar</Button>
          <Button type="submit" className="min-w-36" disabled={catalogsUnavailable || consulting} aria-busy={consulting}>
            {consulting && <Spinner aria-hidden="true" role="presentation" />}
            {consulting ? "Consultando…" : "Consultar"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
