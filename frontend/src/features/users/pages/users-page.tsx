import { useState } from "react";
import { DataTable, RowActionButton, usePagedQuery } from "@/components/shared/data-table";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { PlusIcon, UsersIcon } from "@/icons";
import { PageHeader } from "@/components/shared/page-header";
import { listUsers } from "../api/users-api";
import { userError } from "../api/user-error";
import { DeleteUserDialog } from "../components/delete-user-dialog";
import { UserDrawer } from "../components/user-drawer";
import { userColumns } from "../components/user-columns";
import type { User } from "../types";
import { useUserPermissions } from "../hooks/use-user-permissions";

/** The route requires users.view; each mutation has its own independent permission. */
export default function UsersPage() {
  const permissions = useUserPermissions();
  const canEdit = permissions.update || permissions.deactivate || permissions.assignRoles;
  const query = usePagedQuery({ fetcher: listUsers, initialPageSize: 10 });
  const [editor, setEditor] = useState<{ user: User | null } | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const toast = useToast();
  return <div className="space-y-6">
    <PageHeader icon={<UsersIcon />} title="Administración de usuarios" description="Gestiona las cuentas, los estados y los roles de acceso." />
    <DataTable title="Usuarios" columns={userColumns} rows={query.items} getRowId={user => user.id}
      loading={query.loading} error={query.error ? { message: userError(query.error).message, onRetry: query.reload } : null}
      total={query.total} page={query.page} pageSize={query.pageSize} pageSizeOptions={[10, 25, 50, 100]} onPageChange={query.setPage} onPageSizeChange={query.setPageSize}
      search={query.search} onSearchChange={query.setSearch} searchPlaceholder="Buscar usuarios"
      headerAction={permissions.create ? <Button type="button" onClick={() => { setEditor({ user: null }); }}><PlusIcon aria-hidden="true" />Nuevo usuario</Button> : undefined}
      emptyState={{ title: "No hay usuarios", description: "Crea el primer usuario para comenzar." }}
      rowActions={canEdit || permissions.delete ? user => <>
        {canEdit && <RowActionButton aria-label={`Editar ${user.nombre_usuario}`} onClick={() => { setEditor({ user }); }} />}
        {permissions.delete && <RowActionButton variant="danger" aria-label={`Eliminar ${user.nombre_usuario}`} onClick={() => { setDeleting(user); }} />}
      </> : undefined}
    />
    {editor && <UserDrawer user={editor.user} onClose={() => setEditor(null)} onFailed={query.reload} onSaved={() => {
      toast.success(editor.user ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
      setEditor(null);
      query.reload();
    }} />}
    {deleting && <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
      toast.success("Usuario eliminado correctamente.");
      setDeleting(null);
      query.reload();
    }} />}
  </div>;
}
