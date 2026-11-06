import ThemeToggleButton from "@/components/shared/header/theme-toggler";
import { Outlet } from "react-router";
import AuthBrand from "./auth-brand";

export default function AuthLayout() {
  return (
    <div className="relative z-1 bg-white p-6 sm:p-0 dark:bg-gray-900">
      <div className="relative flex min-h-screen w-full flex-col justify-center sm:p-0 lg:flex-row dark:bg-gray-900">
        <Outlet />
        <div className="relative hidden min-h-screen w-full items-center justify-center overflow-hidden bg-brand-950 lg:grid lg:w-1/2">
          <img src="/images/auth/sign-in-bg.jpg" alt="" aria-hidden="true" width={1600} height={1067} decoding="async" className="absolute inset-0 size-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-brand-950/90 via-brand-950/85 to-brand-950/65 dark:from-brand-950/95 dark:via-brand-950/90 dark:to-brand-950/75" />
          <AuthBrand />
        </div>
        <div className="fixed inset-e-6 bottom-6 z-50 hidden sm:block"><ThemeToggleButton /></div>
      </div>
    </div>
  );
}
