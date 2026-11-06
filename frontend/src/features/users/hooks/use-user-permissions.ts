import { PERMISSIONS } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";

/** Presentation only: the API independently authorizes every operation. */
export function useUserPermissions() {
  const { hasPermission } = useAuth();
  const assignRoles = hasPermission(PERMISSIONS.usersAssignRoles);
  const viewRoles = hasPermission(PERMISSIONS.rolesView);
  return {
    create: hasPermission(PERMISSIONS.usersCreate),
    update: hasPermission(PERMISSIONS.usersUpdate),
    deactivate: hasPermission(PERMISSIONS.usersDeactivate),
    delete: hasPermission(PERMISSIONS.usersDelete),
    assignRoles,
    viewRoles,
    editRoles: assignRoles && viewRoles,
  };
}
export type UserPermissions = ReturnType<typeof useUserPermissions>;
