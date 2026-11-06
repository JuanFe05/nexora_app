import AppHeader from "@/components/layout/app-layout/header";
import AppSidebar from "@/components/layout/app-layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Outlet, useLocation } from "react-router";
import { useEffect } from "react";

export default function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="mx-auto w-full max-w-(--breakpoint-2xl) p-4 md:p-6"><Outlet /></div>
      </SidebarInset>
    </SidebarProvider>
  );
}
