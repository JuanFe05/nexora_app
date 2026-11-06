/**
 * Códigos del catálogo de permisos del backend (`access_catalog.py`), fuente única en el frontend.
 * La autorización real la aplica el backend; el frontend solo los usa para mostrar u ocultar opciones.
 */
export const PERMISSIONS = {
  usersView: "identity.users.view",
  usersCreate: "identity.users.create",
  usersUpdate: "identity.users.update",
  usersDeactivate: "identity.users.deactivate",
  usersDelete: "identity.users.delete",
  usersAssignRoles: "identity.users.assign_roles",
  rolesView: "identity.roles.view",
  rolesCreate: "identity.roles.create",
  rolesUpdate: "identity.roles.update",
  rolesDelete: "identity.roles.delete",
  rolesAssignPermissions: "identity.roles.assign_permissions",
  permissionsView: "identity.permissions.view",
  permissionsCreate: "identity.permissions.create",
  permissionsUpdate: "identity.permissions.update",
  permissionsDelete: "identity.permissions.delete",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
