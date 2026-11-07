import { useState } from "react";
import { DataTable, RowActionButton, usePagedQuery, type DataTableColumn } from "@/components/shared/data-table";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/icons";
import { PERMISSIONS } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";
import { listPermissions, permissionErrorMessage } from "../api/permissions-api";
import { PermissionDeleteDialog } from "../components/permission-delete-dialog";
import { PermissionFormDialog } from "../components/permission-drawer";
import type { Permission } from "../types";

const columns: DataTableColumn<Permission>[] = [
  { id: "codigo", header: "Código", cell: row => <span className="font-mono text-xs break-all">{row.codigo}</span> },
  { id: "nombre", header: "Nombre", cell: row => row.nombre },
  { id: "modulo", header: "Módulo", cell: row => <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium break-all text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{row.modulo}</span> },
  { id: "descripcion", header: "Descripción", cell: row => <span className="block min-w-40 max-w-md break-words">{row.descripcion ?? "—"}</span> },
];

export default function PermissionsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.permissionsCreate);
  const canUpdate = hasPermission(PERMISSIONS.permissionsUpdate);
  const canDelete = hasPermission(PERMISSIONS.permissionsDelete);
  const list = usePagedQuery({ fetcher: listPermissions, initialPageSize: 10 });
  const [form, setForm] = useState<{ permission?: Permission } | null>(null);
  const [deleting, setDeleting] = useState<Permission | null>(null);
  const toast = useToast();

  return (
    <div className="space-y-5">
      <DataTable title="Permisos" description="Administración del catálogo de permisos" columns={columns} rows={list.items}
        getRowId={row => row.id} loading={list.loading}
        error={list.error ? { message: permissionErrorMessage(list.error), onRetry: list.reload } : null}
        total={list.total} page={list.page} pageSize={list.pageSize} pageSizeOptions={[10, 25, 50, 100]}
        onPageChange={list.setPage} onPageSizeChange={list.setPageSize} search={list.search}
        onSearchChange={value => list.setSearch(value.slice(0, 100))} searchPlaceholder="Buscar por código, nombre o módulo"
        headerAction={canCreate ? <Button onClick={() => { setForm({}); }}><PlusIcon aria-hidden="true" />Nuevo permiso</Button> : undefined}
        rowActions={canUpdate || canDelete ? row => <>
          {canUpdate && <RowActionButton aria-label={`Editar permiso ${row.nombre}`} onClick={() => { setForm({ permission: row }); }} />}
          {canDelete && <RowActionButton variant="danger" aria-label={`Eliminar permiso ${row.nombre}`} onClick={() => { setDeleting(row); }} />}
        </> : undefined}
        emptyState={{ title: "No hay permisos", description: "Crea el primer permiso para comenzar." }} />
      {form && (form.permission ? canUpdate : canCreate) && <PermissionFormDialog permission={form.permission} onClose={() => setForm(null)} onSaved={(message, changed) => {
        setForm(null);
        if (changed) toast.success(message); else toast.info(message);
        if (changed) list.reload();
      }} />}
      {deleting && canDelete && <PermissionDeleteDialog permission={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
        setDeleting(null);
        toast.success("Permiso eliminado correctamente.");
        list.reload();
      }} />}
    </div>
  );
}
