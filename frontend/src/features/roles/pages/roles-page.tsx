import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, RowActionButton, usePagedQuery, type DataTableColumn } from "@/components/shared/data-table";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/icons";
import { useAuth } from "@/features/auth/use-auth";
import { PERMISSIONS } from "@/features/auth/permissions";
import { deleteRole, listRoles, roleErrorMessage } from "../api/roles-api";
import { RoleDrawer } from "../components/role-drawer";
import { canDeleteRole } from "../constants";
import type { Role } from "../types";

const columns: DataTableColumn<Role>[] = [
  { id: "codigo", header: "Código", cell: row => <span className="font-medium break-all">{row.codigo}</span> },
  { id: "nombre", header: "Nombre", cell: row => row.nombre },
  { id: "descripcion", header: "Descripción", cell: row => row.descripcion || "—", className: "min-w-40 max-w-xs whitespace-normal" },
  { id: "estado", header: "Estado", cell: row => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${row.estado === "activo" ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>{row.estado === "activo" ? "Activo" : "Inactivo"}</span> },
  { id: "permisos", header: "Permisos", cell: row => <div className="max-w-xs"><span className="font-medium">{row.permisos.length} {row.permisos.length === 1 ? "permiso" : "permisos"}</span><p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400" title={row.permisos.join(", ")}>{row.permisos.slice(0, 2).join(", ") || "Sin permisos"}{row.permisos.length > 2 ? ` y ${row.permisos.length - 2} más` : ""}</p></div> },
];

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.rolesCreate);
  const canEdit = hasPermission(PERMISSIONS.rolesUpdate) || hasPermission(PERMISSIONS.rolesAssignPermissions);
  const canDelete = hasPermission(PERMISSIONS.rolesDelete);
  const query = usePagedQuery({ fetcher: listRoles, initialPageSize: 10 });
  const [drawer, setDrawer] = useState<{ role: Role | null } | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteLock = useRef(false);
  const toast = useToast();

  function openDrawer(role: Role | null) { setDrawer({ role }); }
  async function confirmDelete() {
    if (!canDelete || !deleting || deleteLock.current || !canDeleteRole(deleting.codigo)) return;
    deleteLock.current = true;
    setPendingDelete(true);
    try {
      await deleteRole(deleting.id);
      setDeleting(null);
      toast.success("Rol eliminado correctamente.");
    } catch (failure: unknown) {
      toast.error(roleErrorMessage(failure));
    } finally {
      deleteLock.current = false;
      setPendingDelete(false);
      query.reload();
    }
  }
  return <div className="space-y-6">
    <h1 className="text-title-lg font-semibold text-gray-800 dark:text-white/90">Administración de roles</h1>
    <DataTable title="Roles" description="Administración de roles y sus permisos" columns={columns} rows={query.items} getRowId={row => row.id} loading={query.loading} error={query.error ? { message: roleErrorMessage(query.error), onRetry: query.reload } : null} total={query.total} page={query.page} pageSize={query.pageSize} onPageChange={query.setPage} onPageSizeChange={query.setPageSize} search={query.search} onSearchChange={query.setSearch} searchPlaceholder="Buscar roles" headerAction={canCreate ? <Button onClick={() => openDrawer(null)}><PlusIcon aria-hidden="true" />Nuevo rol</Button> : undefined} emptyState={{ title: "No hay roles", description: "Crea el primer rol para comenzar." }} rowActions={row => <>
      {canEdit && <RowActionButton aria-label={`Editar ${row.nombre}`} onClick={() => openDrawer(row)} />}
      {canDelete && canDeleteRole(row.codigo) && <RowActionButton variant="danger" aria-label={`Eliminar ${row.nombre}`} onClick={() => { setDeleting(row); }} />}
    </>} />
    {drawer && <RoleDrawer role={drawer.role} onClose={() => setDrawer(null)} onReload={query.reload} onSuccess={created => { setDrawer(null); toast.success(created ? "Rol creado correctamente." : "Rol actualizado correctamente."); }} />}
    <ConfirmDialog open={deleting !== null} onOpenChange={open => { if (!open && !pendingDelete) setDeleting(null); }} title="Eliminar rol" description={<span>¿Eliminar el rol {deleting?.nombre}? Esta acción no se puede deshacer.</span>} confirmLabel="Eliminar" variant="danger" pending={pendingDelete} onConfirm={() => { void confirmDelete(); }} />
  </div>;
}
