import type { ComponentType } from "react";
import {
  BriefcaseIcon,
  ChartBarIcon,
  DocumentTextIcon,
  KeyIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  LockIcon,
  UserCircleIcon,
  UsersIcon,
  type IconProps,
} from "@/icons";
import { PERMISSIONS, type PermissionCode } from "@/features/auth/permissions";

export type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  requiredPermission?: PermissionCode;
};

/** Opción de un grupo; sin `path` aún no tiene ruta definida y se muestra deshabilitada. */
export type NavigationGroupItem = {
  label: string;
  path?: string;
  requiredPermission?: PermissionCode;
};
export type NavigationGroup = {
  label: string;
  icon: ComponentType<IconProps>;
  items: NavigationGroupItem[];
};
export type NavigationSection = {
  title: string;
  items: NavigationItem[];
  groups?: NavigationGroup[];
};

export const navigation: NavigationSection[] = [
  {
    title: "ESTADÍSTICA",
    items: [{ label: "Inicio", path: "/", icon: LayoutGridIcon }],
    groups: [
      {
        label: "Informes",
        icon: ChartBarIcon,
        items: [
          {
            label: "Facturas Detalladas",
            path: "/estadistica/informes/facturas-detalladas",
            requiredPermission: PERMISSIONS.detailedInvoicesView,
          },
          { label: "Admisiones (Urgencias)" },
          { label: "Triaje (Urgencias)" },
          {
            label: "Signos Vitales",
            path: "/estadistica/informes/signos-vitales",
            requiredPermission: PERMISSIONS.vitalSignsView,
          },
        ],
      },
      { label: "Gestión Administrativa", icon: BriefcaseIcon, items: [] },
      { label: "Resoluciones", icon: DocumentTextIcon, items: [] },
      { label: "Circulares", icon: MegaphoneIcon, items: [] },
    ],
  },
  {
    title: "CONFIGURACIONES",
    items: [
      {
        label: "Perfil de usuario",
        path: "/configuracion/perfil",
        icon: UserCircleIcon,
      },
      {
        label: "Usuarios",
        path: "/configuracion/usuarios",
        icon: UsersIcon,
        requiredPermission: PERMISSIONS.usersView,
      },
      {
        label: "Permisos",
        path: "/configuracion/permisos",
        icon: KeyIcon,
        requiredPermission: PERMISSIONS.permissionsView,
      },
      {
        label: "Roles",
        path: "/configuracion/roles",
        icon: LockIcon,
        requiredPermission: PERMISSIONS.rolesView,
      },
    ],
  },
];
