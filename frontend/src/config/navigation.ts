import type { ComponentType } from "react";
import {
  BriefcaseIcon,
  ChartBarIcon,
  DocumentTextIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  LockIcon,
  UsersIcon,
  type IconProps,
} from "@/icons";
import { PERMISSIONS, type PermissionCode } from "@/features/auth/permissions";

export type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  requiredPermission?: PermissionCode;
  /** Denegación por defecto: sin `requiredPermission` la entrada solo se muestra si es `public`. */
  public?: boolean;
};

/** Opción de un grupo; sin `path` aún no tiene ruta definida y se muestra deshabilitada. */
export type NavigationGroupItem = {
  label: string;
  path?: string;
  requiredPermission?: PermissionCode;
  /** Igual que las entradas directas: sin permiso solo se muestra si es pública. */
  public?: boolean;
};
export type NavigationGroup = {
  label: string;
  icon: ComponentType<IconProps>;
  items: NavigationGroupItem[];
};
export type NavigationSection = {
  title: string;
  /** Encabezado opcional sobre las entradas directas; `title` pasa a encabezar los grupos. */
  itemsTitle?: string;
  items: NavigationItem[];
  groups?: NavigationGroup[];
  /** La sección (y sus entradas públicas) solo se muestra si algún grupo tiene opciones visibles. */
  requiresVisibleGroup?: boolean;
};

export const navigation: NavigationSection[] = [
  {
    title: "ESTADÍSTICA",
    itemsTitle: "PRINCIPAL",
    requiresVisibleGroup: true,
    items: [{ label: "Inicio", path: "/", icon: LayoutGridIcon, public: true }],
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
          {
            label: "Admisiones (Urgencias)",
            path: "/estadistica/informes/admisiones",
            requiredPermission: PERMISSIONS.admissionsView,
          },
          {
            label: "Triaje (Urgencias)",
            path: "/estadistica/informes/triaje",
            requiredPermission: PERMISSIONS.triageView,
          },
          {
            label: "Signos Vitales",
            path: "/estadistica/informes/signos-vitales",
            requiredPermission: PERMISSIONS.vitalSignsView,
          },
        ],
      },
      {
        label: "Gestión Administrativa",
        icon: BriefcaseIcon,
        items: [
          { label: "Consumo General", path: "/estadistica/administrativa/consumo-general", requiredPermission: PERMISSIONS.generalConsumptionView },
          { label: "Facturación General", path: "/estadistica/administrativa/facturacion-general", requiredPermission: PERMISSIONS.generalBillingView },
          { label: "Consumo de Laboratorio", path: "/estadistica/administrativa/consumo-laboratorio", requiredPermission: PERMISSIONS.labConsumptionView },
          { label: "Gestión de Incapacidades", path: "/estadistica/administrativa/gestion-incapacidades", requiredPermission: PERMISSIONS.disabilityManagementView },
          { label: "Encuestas de Calidad", path: "/estadistica/administrativa/encuestas-de-calidad", requiredPermission: PERMISSIONS.qualitySurveysView },
          { label: "Secretaría Gerencia", path: "/estadistica/administrativa/secretaria-gerencia", requiredPermission: PERMISSIONS.managementSecretariatView },
          { label: "Notificación SIVIGILA", path: "/estadistica/administrativa/notificacion-sivigila", requiredPermission: PERMISSIONS.sivigilaView },
          { label: "BAI Nutrición CYD", requiredPermission: PERMISSIONS.baiNutricionCydView },
        ],
      },
      {
        label: "Resoluciones",
        icon: DocumentTextIcon,
        items: [
          { label: "Resolución 202 de 2021", requiredPermission: PERMISSIONS.res2022021View },
          { label: "Resolución 373 de 2026", requiredPermission: PERMISSIONS.res3732026View },
          { label: "Resolución 1552 de 2013", requiredPermission: PERMISSIONS.res15522013View },
          { label: "Resolución 256 de 2016", requiredPermission: PERMISSIONS.res2562016View },
          { label: "Resolución 2175 de 2015", requiredPermission: PERMISSIONS.res21752015View },
        ],
      },
      {
        label: "Circulares",
        icon: MegaphoneIcon,
        items: [
          { label: "Circular 06 de 2018", requiredPermission: PERMISSIONS.circular062018View },
          { label: "Circular 21 de 2026", requiredPermission: PERMISSIONS.circular212026View },
        ],
      },
    ],
  },
  {
    title: "CONFIGURACIONES",
    items: [],
    groups: [
      {
        label: "Gestión de Usuarios",
        icon: UsersIcon,
        items: [
          { label: "Perfil de usuario", path: "/configuracion/perfil", public: true },
          { label: "Usuarios", path: "/configuracion/usuarios", requiredPermission: PERMISSIONS.usersView },
        ],
      },
      {
        label: "Seguridad y Accesos",
        icon: LockIcon,
        items: [
          { label: "Roles", path: "/configuracion/roles", requiredPermission: PERMISSIONS.rolesView },
          { label: "Permisos", path: "/configuracion/permisos", requiredPermission: PERMISSIONS.permissionsView },
        ],
      },
      {
        label: "Administración",
        icon: DocumentTextIcon,
        items: [
          { label: "Cuotas Moderadoras", path: "/configuracion/cuotas-moderadoras", requiredPermission: PERMISSIONS.moderatorFeesView },
        ],
      },
    ],
  },
];
