import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, RowActionButton, usePagedQuery, type DataTableColumn } from "@/components/shared/data-table";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { KeyIcon, LockIcon, PlusIcon, UsersIcon } from "@/icons";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CountIndicator } from "@/components/shared/count-indicator";
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
  { id: "estado", header: "Estado", cell: row => <StatusBadge estado={row.estado} /> },
  { id: "permisos", header: "Permisos asignados", cell: row => <CountIndicator icon={<KeyIcon />} count={row.permisos.length} label={`${row.permisos.length} ${row.permisos.length === 1 ? "permiso" : "permisos"}`} title={row.permisos.join(", ")} /> },
  { id: "usuarios_asignados", header: "Usuarios asignados", cell: row => <CountIndicator icon={<UsersIcon />} count={row.usuarios_asignados} label={`${row.usuarios_asignados} ${row.usuarios_asignados === 1 ? "usuario" : "usuarios"}`} />, className: "text-end tabular-nums" },
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
  const assignmentWarning = deleting && deleting.usuarios_asignados > 0
    ? `Este rol tiene ${deleting.usuarios_asignados} usuario(s) asignado(s). Revoca sus asignaciones antes de eliminarlo.`
    : null;

  function openDrawer(role: Role | null) { setDrawer({ role }); }
  async function confirmDelete() {
    if (!canDelete || !deleting || deleteLock.current || !canDeleteRole(deleting.codigo)) return;
    if (assignmentWarning) {
      toast.warning(assignmentWarning);
      return;
    }
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
    <PageHeader icon={<LockIcon />} title="Administración de roles" description="Define los roles y los permisos que otorgan." />
    <DataTable icon={<LockIcon />} title="Roles" description="Administración de roles y sus permisos" columns={columns} rows={query.items} getRowId={row => row.id} loading={query.loading} error={query.error ? { message: roleErrorMessage(query.error), onRetry: query.reload } : null} total={query.total} page={query.page} pageSize={query.pageSize} onPageChange={query.setPage} onPageSizeChange={query.setPageSize} search={query.search} onSearchChange={query.setSearch} searchPlaceholder="Buscar roles" headerAction={canCreate ? <Button onClick={() => openDrawer(null)}><PlusIcon aria-hidden="true" />Nuevo rol</Button> : undefined} emptyState={{ title: "No hay roles", description: "Crea el primer rol para comenzar." }} rowActions={row => <>
      {canEdit && <RowActionButton aria-label={`Editar ${row.nombre}`} onClick={() => openDrawer(row)} />}
      {canDelete && canDeleteRole(row.codigo) && <RowActionButton variant="danger" aria-label={`Eliminar ${row.nombre}`} onClick={() => { setDeleting(row); }} />}
    </>} />
    {drawer && <RoleDrawer role={drawer.role} onClose={() => setDrawer(null)} onReload={query.reload} onSuccess={created => { setDrawer(null); toast.success(created ? "Rol creado correctamente." : "Rol actualizado correctamente."); }} />}
    <ConfirmDialog open={deleting !== null} onOpenChange={open => { if (!open && !pendingDelete) setDeleting(null); }} title="Eliminar rol" description={<><span>¿Eliminar el rol {deleting?.nombre}? Esta acción no se puede deshacer.</span>{assignmentWarning && <span className="mt-2 block font-medium text-warning-600 dark:text-warning-400">{assignmentWarning}</span>}</>} confirmLabel="Eliminar" variant="danger" pending={pendingDelete} onConfirm={() => { void confirmDelete(); }} />
  </div>;
}
