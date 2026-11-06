import type { ComponentType } from "react";
import { GearIcon, LayoutGridIcon, UserIcon, type IconProps } from "@/icons";
import { ADMINISTRADOR } from "@/features/auth/roles";

export type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  requiredRole?: string;
};

export type NavigationSection = { title: string; items: NavigationItem[] };

export const navigation: NavigationSection[] = [
  { title: "INFORMES", items: [{ label: "Inicio", path: "/", icon: LayoutGridIcon }] },
  { title: "CONFIGURACIONES", items: [
    { label: "Perfil de usuario", path: "/configuracion/perfil", icon: UserIcon },
    { label: "Usuarios", path: "/configuracion/usuarios", icon: UserIcon, requiredRole: ADMINISTRADOR },
    { label: "Permisos", path: "/configuracion/permisos", icon: GearIcon, requiredRole: ADMINISTRADOR },
    { label: "Roles", path: "/configuracion/roles", icon: GearIcon, requiredRole: ADMINISTRADOR },
  ] },
];
