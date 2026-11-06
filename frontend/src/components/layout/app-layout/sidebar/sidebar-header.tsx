import { SidebarHeader } from "@/components/ui/sidebar";
import { env } from "@/config/env";
import { Link } from "react-router";

export default function AppSidebarHeader({ showContent }: { showContent: boolean }) {
  return (
    <SidebarHeader className="px-5 py-8">
      <Link to="/" aria-label={env.appName} className="text-2xl font-semibold text-gray-800 dark:text-white/90">
        {showContent ? env.appName : env.appName.charAt(0)}
      </Link>
    </SidebarHeader>
  );
}
