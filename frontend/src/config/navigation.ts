import type { ComponentType } from "react";
import { LayoutGridIcon, type IconProps } from "@/icons";

type NavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
};

export const navigation = [{ label: "Inicio", path: "/", icon: LayoutGridIcon }] as const satisfies readonly NavigationItem[];
