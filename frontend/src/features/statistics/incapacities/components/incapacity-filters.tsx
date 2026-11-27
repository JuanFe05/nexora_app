import { useState } from "react";
import { DateField } from "@/components/shared/date-field";
import { MultiSelect, type MultiSelectValue } from "@/components/shared/multi-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { restrictedIds } from "../../shared/report-utils";
import type { CatalogOption, ReportFilters } from "../../shared/types";
import { useCatalog } from "../../shared/use-catalog";

type Props = {
  fetchCompanies: (signal?: AbortSignal) => Promise<CatalogOption[]>;
  consulting: boolean;
  hasResults: boolean;
  onConsult: (filters: ReportFilters) => void;
  onClear: () => void;
};

export function IncapacityFilters({ fetchCompanies, consulting, hasResults, onConsult, onClear }: Props) {
  const companies = useCatalog(fetchCompanies, "Error al cargar opciones");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<MultiSelectValue[]>([]);
  const [errors, setErrors] = useState<{ startDate?: string; endDate?: string }>({});
  const unavailable = companies.loading || Boolean(companies.error);
  const nothingToClear = !startDate && !endDate && !selectedCompanies.length && !errors.startDate && !errors.endDate && !hasResults;

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
    if (nextErrors.startDate || nextErrors.endDate || unavailable || consulting) return;
    onConsult({
      startDate,
      endDate,
      companies: restrictedIds(selectedCompanies, companies.items),
      sites: [],
      productLines: [],
    });
  }

  function clear() {
    setStartDate("");
    setEndDate("");
    setSelectedCompanies([]);
    setErrors({});
    onClear();
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Filtros de consulta</h2>
      <form noValidate onSubmit={(event) => { event.preventDefault(); consult(); }} className="space-y-5">
        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <DateField id="incapacities-start-date" label="Fecha inicial" value={startDate} onChange={setStartDate} required maxDate="today" error={errors.startDate} />
          <DateField id="incapacities-end-date" label="Fecha final" value={endDate} onChange={setEndDate} required maxDate="today" error={errors.endDate} />
          <MultiSelect
            id="incapacities-companies"
            label="Empresa"
            placeholder="Seleccionar empresas"
            searchable
            options={companies.items.map((item) => ({ value: item.id, label: item.nombre }))}
            value={selectedCompanies}
            onChange={setSelectedCompanies}
            loading={companies.loading}
            error={companies.error}
            onRetry={companies.retry}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={clear} disabled={nothingToClear}>Limpiar</Button>
          <Button type="submit" className="min-w-36" disabled={unavailable || consulting} aria-busy={consulting}>
            {consulting && <Spinner aria-hidden="true" role="presentation" />}
            {consulting ? "Consultando…" : "Consultar"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
