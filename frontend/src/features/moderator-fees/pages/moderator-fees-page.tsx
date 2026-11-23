import { useState } from "react";
import { DataTable, RowActionButton, usePagedQuery, type DataTableColumn, type PagedQueryParams } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";
import { DocumentTextIcon, PlusIcon } from "@/icons";
import { listModeratorFees, moderatorFeesErrorMessage } from "../api/moderator-fees-api";
import { ModeratorFeesFormDialog } from "../components/moderator-fees-form-dialog";
import { ModeratorFeesDeleteDialog } from "../components/moderator-fees-delete-dialog";
import type { ModeratorFees } from "../types";

const currency = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const columns: DataTableColumn<ModeratorFees>[] = [
  { id: "vigencia", header: "Vigencia", cell: row => row.vigencia },
  { id: "importes", header: "Importes", cell: row => <span className="block min-w-48">{row.importes.map(value => currency.format(value)).join(" · ")}</span> },
  { id: "actualizado_por", header: "Actualizado por", cell: row => row.actualizado_por ?? "—" },
  { id: "actualizado_en", header: "Fecha", cell: row => <time dateTime={row.actualizado_en}>{dateTime.format(new Date(row.actualizado_en))}</time> },
];

// El contrato devuelve todas las vigencias: búsqueda y paginación son locales.
async function fetchPage({ q, limit, offset, signal }: PagedQueryParams) {
  const rows = (await listModeratorFees(signal))
    .filter(row => `${row.vigencia} ${row.importes.join(" ")} ${row.actualizado_por ?? ""}`.toLocaleLowerCase("es-CO").includes(q.trim().toLocaleLowerCase("es-CO")))
    .sort((a, b) => b.vigencia - a.vigencia);
  return { items: rows.slice(offset, offset + limit), total: rows.length };
}

export default function ModeratorFeesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.moderatorFeesManage);
  const list = usePagedQuery({ fetcher: fetchPage, initialPageSize: 10 });
  const [form, setForm] = useState<{ fee?: ModeratorFees } | null>(null);
  const [deleting, setDeleting] = useState<ModeratorFees | null>(null);
  const toast = useToast();
  return <div className="space-y-6">
    <PageHeader icon={<DocumentTextIcon />} title="Cuotas Moderadoras" description="Administra las cuotas moderadoras por vigencia y consulta su último cambio." />
    <DataTable title="Cuotas Moderadoras" columns={columns} rows={list.items} getRowId={row => row.vigencia} loading={list.loading}
      error={list.error ? { message: moderatorFeesErrorMessage(list.error), onRetry: list.reload } : null}
      total={list.total} page={list.page} pageSize={list.pageSize} onPageChange={list.setPage} onPageSizeChange={list.setPageSize}
      search={list.search} onSearchChange={list.setSearch} searchPlaceholder="Buscar por vigencia, importe o usuario"
      headerAction={canManage ? <Button onClick={() => setForm({})}><PlusIcon aria-hidden="true" />Nueva vigencia</Button> : undefined}
      rowActions={canManage ? row => <>
        <RowActionButton aria-label={`Editar vigencia ${row.vigencia}`} onClick={() => setForm({ fee: row })} />
        <RowActionButton variant="danger" aria-label={`Eliminar vigencia ${row.vigencia}`} onClick={() => setDeleting(row)} />
      </> : undefined}
      emptyState={{ title: "No hay cuotas moderadoras", description: "No hay vigencias configuradas." }} />
    {form && canManage && <ModeratorFeesFormDialog fee={form.fee} onClose={() => setForm(null)} onSaved={() => {
      setForm(null);
      toast.success(form.fee ? "Vigencia actualizada correctamente." : "Vigencia creada correctamente.");
      list.reload();
    }} />}
    {deleting && canManage && <ModeratorFeesDeleteDialog fee={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
      setDeleting(null);
      toast.success("Vigencia eliminada correctamente.");
      list.reload();
    }} />}
  </div>;
}
