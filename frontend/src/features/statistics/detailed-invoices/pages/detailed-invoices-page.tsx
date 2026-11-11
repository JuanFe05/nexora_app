import { useCallback, useEffect, useState } from "react";
import {
  ColumnVisibilityMenu,
  DataTable,
  usePagedQuery,
  type PagedQueryParams,
} from "@/components/shared/data-table";
import { DateField } from "@/components/shared/date-field";
import {
  MultiSelect,
  type MultiSelectValue,
} from "@/components/shared/multi-select";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartBarIcon } from "@/icons";
import { ApiError } from "@/lib/http/api-error";
import {
  fetchCompanies,
  fetchDetailedInvoices,
  fetchSites,
} from "../api/detailed-invoices-api";
import { defaultVisibleColumns, invoiceColumns } from "../columns";
import type { CatalogOption, InvoiceFilters } from "../types";

function useCatalog(
  fetcher: (signal?: AbortSignal) => Promise<CatalogOption[]>,
  errorMessage: string,
) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    items: CatalogOption[];
    error?: string;
    revision: number;
  }>({ items: [], revision: -1 });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetcher(controller.signal)
      .then((items) => {
        if (active) setResult({ items, revision });
      })
      .catch(() => {
        if (active) setResult({ items: [], error: errorMessage, revision });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [fetcher, errorMessage, revision]);
  const loading = revision !== result.revision;
  return {
    items: result.items,
    loading,
    error: loading ? undefined : result.error,
    retry: () => setRevision((current) => current + 1),
  };
}

/** A complete or empty selection means unrestricted; only real catalog ids may leave this boundary. */
function restrictedIds(selected: MultiSelectValue[], catalog: CatalogOption[]) {
  const ids = catalog
    .filter((option) => selected.includes(option.id))
    .map((option) => option.id);
  return ids.length === catalog.length ? [] : ids;
}
function reportError(error: Error) {
  if (
    error instanceof ApiError &&
    (error.status === 502 || error.status === 503)
  )
    return "No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo.";
  if (error instanceof ApiError && error.status === 422)
    return "Revisa el período seleccionado. La fecha inicial no puede ser posterior a la fecha final.";
  return "No se pudo consultar el informe. Intenta de nuevo.";
}
const ignoreSearch = () => {};

/** Mounted only on Consultar: usePagedQuery never fetches for draft filters or the initial hint. */
function InvoiceResults({
  filters,
  visibleColumns,
  onVisibleColumnsChange,
}: {
  filters: InvoiceFilters;
  visibleColumns: string[];
  onVisibleColumnsChange: (value: string[]) => void;
}) {
  const fetcher = useCallback(
    (params: PagedQueryParams) => fetchDetailedInvoices(filters, params),
    [filters],
  );
  const query = usePagedQuery({ fetcher, initialPageSize: 50 });
  return (
    <DataTable
      title="Resultados"
      description={
        query.loading
          ? "Consultando registros…"
          : query.error
            ? undefined
            : `${query.total} registros encontrados`
      }
      columns={invoiceColumns.filter((column) =>
        visibleColumns.includes(column.id),
      )}
      rows={query.items}
      // The source has no unique line id; the server's stable order plus absolute row position identifies this read-only page.
      getRowId={(row) =>
        query.items.indexOf(row) + (query.page - 1) * query.pageSize
      }
      loading={query.loading}
      error={
        query.error
          ? { message: reportError(query.error), onRetry: query.reload }
          : null
      }
      total={query.total}
      page={query.page}
      pageSize={query.pageSize}
      pageSizeOptions={[10, 25, 50, 100]}
      onPageChange={query.setPage}
      onPageSizeChange={query.setPageSize}
      search=""
      onSearchChange={ignoreSearch}
      showSearch={false}
      headerAction={
        <ColumnVisibilityMenu
          columns={invoiceColumns}
          value={visibleColumns}
          onChange={onVisibleColumnsChange}
        />
      }
      emptyState={{
        title: "No hay facturas para este período.",
        description: "Prueba con otro período o modifica los filtros.",
      }}
    />
  );
}

export default function DetailedInvoicesPage() {
  const sites = useCatalog(fetchSites, "No se pudieron cargar las sedes.");
  const companies = useCatalog(
    fetchCompanies,
    "No se pudieron cargar las empresas.",
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedSites, setSelectedSites] = useState<MultiSelectValue[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<
    MultiSelectValue[]
  >([]);
  const [errors, setErrors] = useState<{
    startDate?: string;
    endDate?: string;
  }>({});
  const [applied, setApplied] = useState<{
    filters: InvoiceFilters;
    revision: number;
  } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    defaultVisibleColumns,
  );
  const catalogsUnavailable =
    sites.loading ||
    companies.loading ||
    Boolean(sites.error || companies.error);

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
    if (nextErrors.startDate || nextErrors.endDate || catalogsUnavailable)
      return;
    const filters = {
      startDate,
      endDate,
      sites: restrictedIds(selectedSites, sites.items),
      companies: restrictedIds(selectedCompanies, companies.items),
    };
    setApplied((current) => ({
      filters,
      revision: (current?.revision ?? 0) + 1,
    }));
  }
  function clear() {
    setStartDate("");
    setEndDate("");
    setSelectedSites([]);
    setSelectedCompanies([]);
    setErrors({});
    setApplied(null);
  }
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        icon={<ChartBarIcon />}
        title="Facturas Detalladas"
        description="Consulta las facturas por período, sede y empresa."
      />
      <Card>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Filtros de consulta
        </h2>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            consult();
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <DateField
              id="invoice-start-date"
              label="Fecha inicial"
              value={startDate}
              onChange={setStartDate}
              required
              error={errors.startDate}
            />
            <DateField
              id="invoice-end-date"
              label="Fecha final"
              value={endDate}
              onChange={setEndDate}
              required
              error={errors.endDate}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <MultiSelect
              id="invoice-sites"
              label="Sede"
              options={sites.items.map((item) => ({
                value: item.id,
                label: item.nombre,
              }))}
              value={selectedSites}
              onChange={setSelectedSites}
              loading={sites.loading}
              error={sites.error}
              onRetry={sites.retry}
            />
            <MultiSelect
              id="invoice-companies"
              label="Empresa"
              options={companies.items.map((item) => ({
                value: item.id,
                label: item.nombre,
              }))}
              value={selectedCompanies}
              onChange={setSelectedCompanies}
              loading={companies.loading}
              error={companies.error}
              onRetry={companies.retry}
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sin selección o con todas las opciones seleccionadas, no se
            restringe la sede o la empresa.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={clear}>
              Limpiar
            </Button>
            <Button type="submit" disabled={catalogsUnavailable}>
              Consultar
            </Button>
          </div>
        </form>
      </Card>
      {applied ? (
        <InvoiceResults
          key={applied.revision}
          filters={applied.filters}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={setVisibleColumns}
        />
      ) : (
        <Card>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Resultados
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Selecciona un período y presiona Consultar.
          </p>
        </Card>
      )}
    </div>
  );
}
