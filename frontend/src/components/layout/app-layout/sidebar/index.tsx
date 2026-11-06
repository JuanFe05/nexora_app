import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { navigation } from "@/config/navigation";
import { useAuth } from "@/features/auth/use-auth";
import { cn } from "@/utils";
import { Link, useLocation } from "react-router";
import AppSidebarHeader from "./sidebar-header";

export default function AppSidebar() {
  const { open, isMobile, isHovered, setOpenMobile } = useSidebar();
  const { roles } = useAuth();
  const { pathname } = useLocation();
  const showContent = open || isHovered || isMobile;
  const sections = navigation.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.requiredRole || roles.includes(item.requiredRole)),
  })).filter((section) => section.items.length > 0);

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
            <ul className="flex flex-col gap-4">
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
            </ul>
          </nav>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
