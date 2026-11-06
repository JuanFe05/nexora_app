import type { ComponentType } from "react";
import { KeyIcon, LayoutGridIcon, LockIcon, UserCircleIcon, UsersIcon, type IconProps } from "@/icons";
import { PERMISSIONS, type PermissionCode } from "@/features/auth/permissions";

export type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  requiredPermission?: PermissionCode;
};

export type NavigationSection = { title: string; items: NavigationItem[] };

export const navigation: NavigationSection[] = [
  { title: "INFORMES", items: [{ label: "Inicio", path: "/", icon: LayoutGridIcon }] },
  { title: "CONFIGURACIONES", items: [
    { label: "Perfil de usuario", path: "/configuracion/perfil", icon: UserCircleIcon },
    { label: "Usuarios", path: "/configuracion/usuarios", icon: UsersIcon, requiredPermission: PERMISSIONS.usersView },
    { label: "Permisos", path: "/configuracion/permisos", icon: KeyIcon, requiredPermission: PERMISSIONS.permissionsView },
    { label: "Roles", path: "/configuracion/roles", icon: LockIcon, requiredPermission: PERMISSIONS.rolesView },
  ] },
];
