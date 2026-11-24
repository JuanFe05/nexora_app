import { useState, type ReactNode } from "react";
import { DateField } from "@/components/shared/date-field";
import { MultiSelect, type MultiSelectValue } from "@/components/shared/multi-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { restrictedIds } from "../../shared/report-utils";
import { useCatalog } from "../../shared/use-catalog";
import type { ReportFilters } from "../../shared/types";
import { labConsumptionApi } from "../api/lab-consumption-api";
export function ConsumptionFilters({ consulting, hasResults, beforeConsult, onConsult, onClear }: {
  consulting: boolean; hasResults: boolean; beforeConsult: ReactNode; onConsult: (filters: ReportFilters) => void; onClear: () => void;
}) {
  const sites = useCatalog(labConsumptionApi.fetchSites, "Error al cargar opciones");
  const companies = useCatalog(labConsumptionApi.fetchCompanies, "Error al cargar opciones");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedSites, setSelectedSites] = useState<MultiSelectValue[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<MultiSelectValue[]>([]);
  const [errors, setErrors] = useState<{ startDate?: string; endDate?: string }>({});
  const unavailable = [sites, companies].some((catalog) => catalog.loading || Boolean(catalog.error));
  const nothingToClear = !startDate && !endDate && !selectedSites.length && !selectedCompanies.length && !errors.startDate && !errors.endDate && !hasResults;
  function consult() {
    const next = { startDate: !startDate ? "La fecha inicial es obligatoria." : endDate && startDate > endDate ? "La fecha inicial no puede ser posterior a la fecha final." : undefined, endDate: !endDate ? "La fecha final es obligatoria." : undefined };
    setErrors(next);
    if (next.startDate || next.endDate || unavailable || consulting) return;
    onConsult({ startDate, endDate, sites: restrictedIds(selectedSites, sites.items), companies: restrictedIds(selectedCompanies, companies.items), productLines: [] });
  }
  return <Card>
    <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Filtros de consulta</h2>
    <form noValidate onSubmit={(event) => { event.preventDefault(); consult(); }} className="space-y-5">
      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
        <DateField id="lab-consumption-start-date" label="Fecha inicial" value={startDate} onChange={setStartDate} required maxDate="today" error={errors.startDate} />
        <DateField id="lab-consumption-end-date" label="Fecha final" value={endDate} onChange={setEndDate} required maxDate="today" error={errors.endDate} />
        <MultiSelect id="lab-consumption-sites" label="Sede" placeholder="Seleccionar sedes" options={sites.items.map((item) => ({ value: item.id, label: item.nombre }))} value={selectedSites} onChange={setSelectedSites} loading={sites.loading} error={sites.error} onRetry={sites.retry} />
        <MultiSelect id="lab-consumption-companies" label="Empresa" placeholder="Seleccionar empresas" searchable options={companies.items.map((item) => ({ value: item.id, label: item.nombre }))} value={selectedCompanies} onChange={setSelectedCompanies} loading={companies.loading} error={companies.error} onRetry={companies.retry} />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" disabled={nothingToClear} onClick={() => { setStartDate(""); setEndDate(""); setSelectedSites([]); setSelectedCompanies([]); setErrors({}); onClear(); }}>Limpiar</Button>
        {beforeConsult}
        <Button type="submit" className="min-w-36" disabled={unavailable || consulting} aria-busy={consulting}>{consulting && <Spinner aria-hidden="true" role="presentation" />}{consulting ? "Consultando…" : "Consultar"}</Button>
      </div>
    </form>
  </Card>;
}
