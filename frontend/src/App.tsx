import { Suspense } from "react";
import { BrowserRouter, useRoutes } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/theme-context";
import { routes } from "@/routes";
import { AuthProvider } from "@/features/auth/auth-provider";

function AppRoutes() {
  return useRoutes(routes);
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <HelmetProvider>
          <AuthProvider>
            <Suspense fallback={<p role="status" className="p-6 text-gray-700 dark:text-gray-300">Cargando…</p>}>
              <AppRoutes />
            </Suspense>
          </AuthProvider>
        </HelmetProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
