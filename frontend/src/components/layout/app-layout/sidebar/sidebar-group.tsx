import { useState } from "react";
import { Link } from "react-router";
import type { NavigationGroup } from "@/config/navigation";
import { ChevronDownIcon } from "@/icons";
import { cn } from "@/utils";

type Props = { group: NavigationGroup; pathname: string; showContent: boolean; onNavigate: () => void };

/** Grupo desplegable: encabezado con icono y chevron; las opciones sin ruta se muestran deshabilitadas. */
export default function SidebarGroup({ group, pathname, showContent, onNavigate }: Props) {
  const hasActiveChild = group.items.some((item) => item.path === pathname);
  const [open, setOpen] = useState(hasActiveChild);
  const expanded = showContent && open;
  const panelId = `sidebar-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <li>
      <button type="button" aria-expanded={expanded} aria-controls={panelId} aria-label={group.label}
        onClick={() => setOpen((value) => !value)}
        className={cn("group menu-item", hasActiveChild ? "menu-item-active" : "menu-item-inactive", !showContent && "justify-center")}>
        <group.icon aria-hidden="true" className={cn("size-6 shrink-0", hasActiveChild ? "menu-item-icon-active" : "menu-item-icon-inactive")} />
        {showContent && <span className="flex-1 text-left">{group.label}</span>}
        {showContent && <ChevronDownIcon aria-hidden="true" className={cn("size-5 shrink-0 transition-transform duration-200", expanded && "rotate-180")} />}
      </button>
      <div id={panelId} hidden={!expanded} className="overflow-hidden">
        <ul className="mt-2 ml-9 flex flex-col gap-1 border-l border-gray-200 pl-3 dark:border-gray-800">
          {group.items.length === 0 && <li className="px-3 py-1.5 text-sm text-gray-400 dark:text-gray-500">Sin opciones aún</li>}
          {group.items.map((item) => {
            const active = item.path === pathname;
            return (
              <li key={item.label}>
                {item.path ? (
                  <Link to={item.path} aria-current={active ? "page" : undefined} onClick={onNavigate}
                    className={cn("menu-item", active ? "menu-item-active" : "menu-item-inactive")}>{item.label}</Link>
                ) : (
                  <span aria-disabled="true" className="menu-item cursor-not-allowed text-gray-400 dark:text-gray-500">{item.label}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}
