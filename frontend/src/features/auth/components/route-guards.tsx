import { Navigate, Outlet } from "react-router";
import { useAuth } from "../use-auth";

function SessionLoading() {
  return <p role="status" className="p-6 text-gray-700 dark:text-gray-300">Cargando sesión…</p>;
}

export function ProtectedRoute() {
  const { status } = useAuth();
  if (status === "loading") return <SessionLoading />;
  if (status === "anonymous") return <Navigate to="/signin" replace />;
  return <Outlet />;
}

// Nested under ProtectedRoute: session restoration and anonymous redirects stay there.
export function RequirePermission({ permission }: { permission: string }) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <Outlet /> : <Navigate to="/" replace />;
}

export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === "loading") return <SessionLoading />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}
