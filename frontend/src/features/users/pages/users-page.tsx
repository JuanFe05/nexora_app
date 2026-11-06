import { useState } from "react";
import { DataTable, RowActionButton, usePagedQuery } from "@/components/shared/data-table";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
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
  const [success, setSuccess] = useState<string | null>(null);
  return <div className="space-y-6">
    <h1 className="text-title-lg font-semibold text-gray-800 dark:text-white/90">Administración de usuarios</h1>
    {success && <InlineAlert variant="success">{success}</InlineAlert>}
    <DataTable title="Usuarios" description="Administra los datos, el estado y los roles de los usuarios." columns={userColumns} rows={query.items} getRowId={user => user.id}
      loading={query.loading} error={query.error ? { message: userError(query.error).message, onRetry: query.reload } : null}
      total={query.total} page={query.page} pageSize={query.pageSize} pageSizeOptions={[10, 25, 50, 100]} onPageChange={query.setPage} onPageSizeChange={query.setPageSize}
      search={query.search} onSearchChange={query.setSearch} searchPlaceholder="Buscar usuarios"
      headerAction={permissions.create ? <Button type="button" onClick={() => { setSuccess(null); setEditor({ user: null }); }}>Nuevo usuario</Button> : undefined}
      emptyState={{ title: "No hay usuarios", description: "Crea el primer usuario para comenzar." }}
      rowActions={canEdit || permissions.delete ? user => <>
        {canEdit && <RowActionButton aria-label={`Editar ${user.nombre_usuario}`} onClick={() => { setSuccess(null); setEditor({ user }); }} />}
        {permissions.delete && <RowActionButton variant="danger" aria-label={`Eliminar ${user.nombre_usuario}`} onClick={() => { setSuccess(null); setDeleting(user); }} />}
      </> : undefined}
    />
    {editor && <UserDrawer user={editor.user} onClose={() => setEditor(null)} onFailed={query.reload} onSaved={() => {
      setSuccess(editor.user ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
      setEditor(null);
      query.reload();
    }} />}
    {deleting && <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
      setSuccess("Usuario eliminado correctamente.");
      setDeleting(null);
      query.reload();
    }} />}
  </div>;
}
