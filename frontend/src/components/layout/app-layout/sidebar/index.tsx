import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { navigation } from "@/config/navigation";
import type { PermissionCode } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";
import { cn } from "@/utils";
import { Link, useLocation } from "react-router";
import AppSidebarHeader from "./sidebar-header";
import SidebarGroup from "./sidebar-group";

export default function AppSidebar() {
  const { open, isMobile, isHovered, setOpenMobile } = useSidebar();
  const { hasPermission } = useAuth();
  const { pathname } = useLocation();
  const showContent = open || isHovered || isMobile;
  // Denegación por defecto: solo se muestra lo que el usuario autenticado tiene permitido de forma explícita.
  const allowed = (item: { requiredPermission?: PermissionCode; public?: boolean }) =>
    item.requiredPermission ? hasPermission(item.requiredPermission) : item.public === true;
  const sections = navigation.map((section) => {
    const groups = (section.groups ?? [])
      .map((group) => ({ ...group, items: group.items.filter(allowed) }))
      .filter((group) => group.items.length > 0);
    const gated = section.requiresVisibleGroup && groups.length === 0;
    return { ...section, items: gated ? [] : section.items.filter(allowed), groups: gated ? [] : groups };
  }).filter((section) => section.items.length > 0 || section.groups.length > 0);

  return (
    <Sidebar side="left">
      <AppSidebarHeader showContent={showContent} />
      <SidebarContent className="overflow-y-auto px-5 duration-300 ease-linear">
        {sections.map((section) => (
          <nav key={section.title} className="mb-6" aria-label={section.title}>
            <h2 className="menu-group-title mb-4 flex text-xs leading-5 text-gray-400 uppercase">
              {showContent ? section.title : (
                <svg aria-hidden="true" className="mx-auto size-6" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
              )}
            </h2>
            <ul className="flex flex-col gap-2">
              {section.items.map((item) => {
                const active = pathname === item.path;
                return (
                  <li key={item.path}>
                    <Link to={item.path} aria-current={active ? "page" : undefined} aria-label={item.label}
                      onClick={() => setOpenMobile(false)}
                      className={cn("group menu-item", active ? "menu-item-active" : "menu-item-inactive", !showContent && "justify-center")}>
                      <item.icon aria-hidden="true" className={cn("size-6 shrink-0", active ? "menu-item-icon-active" : "menu-item-icon-inactive")} />
                      {showContent && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
              {section.groups?.map((group) => (
                <SidebarGroup key={group.label} group={group} pathname={pathname} showContent={showContent} onNavigate={() => setOpenMobile(false)} />
              ))}
            </ul>
          </nav>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
