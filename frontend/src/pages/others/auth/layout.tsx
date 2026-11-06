import GridShape from "@/components/shared/grid-shape";
import ThemeToggleButton from "@/components/shared/header/theme-toggler";
import { env } from "@/config/env";
import { Link, Outlet } from "react-router";

export default function AuthLayout() {
  return (
    <div className="relative z-1 bg-white p-6 sm:p-0 dark:bg-gray-900">
      <div className="relative flex min-h-screen w-full flex-col justify-center sm:p-0 lg:flex-row dark:bg-gray-900">
        <Outlet />
        <div className="relative hidden min-h-screen w-full items-center justify-center bg-brand-950 lg:grid lg:w-1/2 dark:bg-white/5">
          <div className="z-1 flex h-full items-center justify-center">
            <GridShape />
            <div className="flex max-w-xs flex-col items-center">
              <Link to="/" className="mb-4 block text-4xl font-semibold text-white">{env.appName}</Link>
            </div>
          </div>
        </div>
        <div className="fixed inset-e-6 bottom-6 z-50 hidden sm:block"><ThemeToggleButton /></div>
      </div>
    </div>
  );
}
