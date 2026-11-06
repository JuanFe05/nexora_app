import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { navigation } from "@/config/navigation";
import { LayoutGridIcon } from "@/icons";
import { cn } from "@/utils";
import { Link, useLocation } from "react-router";
import AppSidebarHeader from "./sidebar-header";

export default function AppSidebar() {
  const { open, isMobile, isHovered, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const showContent = open || isHovered || isMobile;
  return (
    <Sidebar side="left">
      <AppSidebarHeader showContent={showContent} />
      <SidebarContent className="overflow-y-auto px-5 duration-300 ease-linear">
        <nav className="mb-6" aria-label="Menú">
          <h2 className="mb-4 text-xs leading-5 text-gray-400 uppercase">{showContent ? "Menú" : "…"}</h2>
          <ul className="flex flex-col gap-4">
            {navigation.map((item) => {
              const active = pathname === item.path;
              return (
                <li key={item.path}>
                  <Link to={item.path} aria-current={active ? "page" : undefined} aria-label={item.label}
                    onClick={() => setOpenMobile(false)}
                    className={cn("group menu-item", active ? "menu-item-active" : "menu-item-inactive", !showContent && "justify-center")}>
                    <LayoutGridIcon className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"} />
                    {showContent && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
