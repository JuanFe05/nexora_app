import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../use-auth";

function SessionLoading() {
  return <p role="status" className="p-6 text-gray-700 dark:text-gray-300">Cargando sesión…</p>;
}

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <SessionLoading />;
  if (status === "anonymous") {
    return <Navigate to="/signin" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <SessionLoading />;
  if (status === "authenticated") {
    // Only accept internal paths captured by ProtectedRoute, never an external redirect.
    const from: unknown = location.state?.from;
    const destination = typeof from === "string" && from.startsWith("/") && !from.startsWith("//")
      && !from.startsWith("/signin") && !from.includes("\\") ? from : "/";
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
