import { Suspense } from "react";
import { BrowserRouter, useRoutes } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import { ThemeProvider } from "@/contexts/theme-context";
import { routes } from "@/routes";
import { AuthProvider } from "@/features/auth/auth-provider";
import { SessionExpiryDialog } from "@/components/shared/session-expiry-dialog";

function AppRoutes() {
  return useRoutes(routes);
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <HelmetProvider>
          <ToastProvider>
            <AuthProvider>
              <SessionExpiryDialog />
              <Suspense fallback={<p role="status" className="p-6 text-gray-700 dark:text-gray-300">Cargando…</p>}>
                <AppRoutes />
              </Suspense>
            </AuthProvider>
          </ToastProvider>
        </HelmetProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
