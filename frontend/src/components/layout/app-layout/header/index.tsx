import ThemeToggleButton from "@/components/shared/header/theme-toggler";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { env } from "@/config/env";
import { UserMenu } from "@/features/auth/components/user-menu";
import { MenuTwoIcon, XIcon } from "@/icons";
import { Link } from "react-router";

export default function AppHeader() {
  const { openMobile, toggleSidebar } = useSidebar();
  return (
    <header className="sticky top-0 z-50 flex w-full shrink-0 border-gray-200 bg-white xl:border-b dark:border-gray-800 dark:bg-gray-900">
      <div className="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 sm:gap-4 xl:border-b-0 xl:px-6 xl:py-4 dark:border-gray-800">
        <Button variant="outline" size="icon" className="text-gray-500 lg:size-11 dark:text-gray-400" onClick={toggleSidebar} aria-label="Alternar barra lateral">
          {openMobile ? <XIcon className="size-6" /> : <MenuTwoIcon className="size-auto!" />}
        </Button>
        <Link to="/" className="text-title-sm font-semibold text-gray-800 xl:hidden dark:text-white/90">{env.appName}</Link>
        <div className="ms-auto flex items-center gap-2">
          <ThemeToggleButton />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
