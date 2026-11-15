import { SidebarHeader } from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/shared/brand-logo";
import { env } from "@/config/env";
import { Link } from "react-router";

export default function AppSidebarHeader({ showContent }: { showContent: boolean }) {
  return (
    <SidebarHeader className="px-5 py-8">
      <Link to="/" aria-label={env.appName} className="flex items-center justify-center gap-3 text-2xl font-semibold text-gray-800 dark:text-white/90">
        <BrandLogo className="size-9" />
        {showContent && <span>{env.appName}</span>}
      </Link>
    </SidebarHeader>
  );
}
