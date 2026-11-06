import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/utils";
import * as React from "react";
import { useLocation } from "react-router";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "18.125rem";
const SIDEBAR_WIDTH_MOBILE = "18.125rem";
const SIDEBAR_WIDTH_ICON = "5.625rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar debe usarse dentro de SidebarProvider.");
  return context;
}

function SidebarProvider({ defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const { pathname } = useLocation();
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback((value: boolean | ((value: boolean) => boolean)) => {
    const openState = typeof value === "function" ? value(open) : value;
    if (setOpenProp) setOpenProp(openState);
    else _setOpen(openState);
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  }, [setOpenProp, open]);

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => { setOpenMobile(false); }, [pathname]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  const contextValue = React.useMemo<SidebarContextProps>(() => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, isHovered, setIsHovered, toggleSidebar }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, isHovered, setIsHovered, toggleSidebar]);

  return (
    <SidebarContext.Provider value={contextValue}>
      <div data-slot="sidebar-wrapper" style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties}
        className={cn("group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full", className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({ side = "left", className, children, dir, ...props }: React.ComponentProps<"div"> & { side?: "left" | "right" }) {
  const { isMobile, state, openMobile, setOpenMobile, isHovered, setIsHovered } = useSidebar();
  const effectiveState = !isMobile && isHovered && state === "collapsed" ? "expanded" : state;
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent dir={dir} data-sidebar="sidebar" data-slot="sidebar" data-mobile="true" side={side}
          className="w-(--sidebar-width) border-e border-gray-200 bg-white p-0 text-gray-900 dark:border-gray-800 dark:bg-gray-900 [&>button]:hidden"
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}>
          <SheetHeader className="sr-only">
            <SheetTitle>Barra lateral</SheetTitle>
            <SheetDescription>Menú de navegación móvil.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <div className="group/sidebar peer hidden xl:block" data-state={effectiveState} data-collapsible={effectiveState === "collapsed" ? "icon" : ""} data-variant="sidebar" data-side={side} data-slot="sidebar">
      <div data-slot="sidebar-gap" className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-300 ease-in-out group-data-[collapsible=icon]/sidebar:w-(--sidebar-width-icon) group-data-[side=right]/sidebar:rotate-180" />
      <div data-slot="sidebar-container" data-side={side}
        className={cn(
          "fixed inset-y-0 z-50 hidden h-svh w-(--sidebar-width) transition-[inset,width] duration-300 ease-in-out data-[side=left]:inset-s-0 data-[side=right]:inset-e-0 xl:flex",
          "border-gray-200 group-data-[collapsible=icon]/sidebar:w-(--sidebar-width-icon) group-data-[side=left]/sidebar:border-e group-data-[side=right]/sidebar:border-s dark:border-gray-800",
          className,
        )}
        onMouseEnter={() => { if (state === "collapsed") setIsHovered(true); }}
        onMouseLeave={() => setIsHovered(false)} {...props}>
        <div data-sidebar="sidebar" data-slot="sidebar-inner" className="flex size-full flex-col bg-white text-gray-900 dark:bg-gray-900">
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return <main data-slot="sidebar-inset" className={cn("relative flex w-full flex-1 flex-col transition-all duration-300 ease-in-out", className)} {...props} />;
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" data-sidebar="content" className={cn("no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]/sidebar:overflow-hidden", className)} {...props} />;
}

export { Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarProvider, useSidebar };
