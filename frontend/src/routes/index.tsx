import { lazy } from "react";
import type { RouteObject } from "react-router";
import AppLayout from "@/components/layout/app-layout";
import AuthLayout from "@/pages/others/auth/layout";
import { ProtectedRoute, PublicOnlyRoute, RequirePermission } from "@/features/auth/components/route-guards";
import { PERMISSIONS } from "@/features/auth/permissions";

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/others/auth/sign-in"));
const Error404Page = lazy(() => import("@/pages/error-404"));
const ProfilePage = lazy(() => import("@/features/profile/pages/profile-page"));
const UsersPage = lazy(() => import("@/features/users/pages/users-page"));
const PermissionsPage = lazy(() => import("@/features/permissions/pages/permissions-page"));
const RolesPage = lazy(() => import("@/features/roles/pages/roles-page"));

export const routes: RouteObject[] = [
  { element: <ProtectedRoute />, children: [
    { element: <AppLayout />, children: [
      { index: true, element: <HomePage /> },
      { path: "/configuracion/perfil", element: <ProfilePage /> },
      { element: <RequirePermission permission={PERMISSIONS.usersView} />, children: [
        { path: "/configuracion/usuarios", element: <UsersPage /> },
      ] },
      { element: <RequirePermission permission={PERMISSIONS.permissionsView} />, children: [
        { path: "/configuracion/permisos", element: <PermissionsPage /> },
      ] },
      { element: <RequirePermission permission={PERMISSIONS.rolesView} />, children: [
        { path: "/configuracion/roles", element: <RolesPage /> },
      ] },
    ] },
  ] },
  { element: <PublicOnlyRoute />, children: [
    { element: <AuthLayout />, children: [{ path: "/signin", element: <SignInPage /> }] },
  ] },
  { path: "*", element: <Error404Page /> },
];
