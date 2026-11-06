import { lazy } from "react";
import type { RouteObject } from "react-router";
import AppLayout from "@/components/layout/app-layout";
import AuthLayout from "@/pages/others/auth/layout";
import { ProtectedRoute, PublicOnlyRoute } from "@/features/auth/components/route-guards";

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/others/auth/sign-in"));
const Error404Page = lazy(() => import("@/pages/error-404"));

export const routes: RouteObject[] = [
  { element: <ProtectedRoute />, children: [
    { element: <AppLayout />, children: [{ index: true, element: <HomePage /> }] },
  ] },
  { element: <PublicOnlyRoute />, children: [
    { element: <AuthLayout />, children: [{ path: "/signin", element: <SignInPage /> }] },
  ] },
  { path: "*", element: <Error404Page /> },
];
