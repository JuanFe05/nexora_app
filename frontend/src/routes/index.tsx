import { lazy } from "react";
import type { RouteObject } from "react-router";
import AppLayout from "@/components/layout/app-layout";
import AuthLayout from "@/pages/others/auth/layout";
import {
  ProtectedRoute,
  PublicOnlyRoute,
  RequirePermission,
} from "@/features/auth/components/route-guards";
import { PERMISSIONS } from "@/features/auth/permissions";

const HomePage = lazy(() => import("@/pages/home"));
const SignInPage = lazy(() => import("@/pages/others/auth/sign-in"));
const Error404Page = lazy(() => import("@/pages/error-404"));
const ProfilePage = lazy(() => import("@/features/profile/pages/profile-page"));
const UsersPage = lazy(() => import("@/features/users/pages/users-page"));
const PermissionsPage = lazy(
  () => import("@/features/permissions/pages/permissions-page"),
);
const ModeratorFeesPage = lazy(() => import("@/features/moderator-fees/pages/moderator-fees-page"));
const RolesPage = lazy(() => import("@/features/roles/pages/roles-page"));
const DetailedInvoicesPage = lazy(
  () =>
    import("@/features/statistics/detailed-invoices/pages/detailed-invoices-page"),
);

const VitalSignsPage = lazy(
  () => import("@/features/statistics/vital-signs/pages/vital-signs-page"),
);

const LabConsumptionPage = lazy(
  () => import("@/features/statistics/lab-consumption/pages/lab-consumption-page"),
);

const GeneralConsumptionPage = lazy(
  () => import("@/features/statistics/general-consumption/pages/general-consumption-page"),
);

const GeneralBillingPage = lazy(
  () => import("@/features/statistics/general-billing/pages/general-billing-page"),
);

const SivigilaPage = lazy(
  () => import("@/features/statistics/sivigila/pages/sivigila-page"),
);

const AdmissionsPage = lazy(
  () => import("@/features/statistics/admissions/pages/admissions-page"),
);

const TriagePage = lazy(
  () => import("@/features/statistics/triage/pages/triage-page"),
);

export const routes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "/configuracion/perfil", element: <ProfilePage /> },
          {
            element: <RequirePermission permission={PERMISSIONS.moderatorFeesView} />,
            children: [
              { path: "/configuracion/cuotas-moderadoras", element: <ModeratorFeesPage /> },
            ],
          },
          {
            element: (
              <RequirePermission
                permission={PERMISSIONS.detailedInvoicesView}
              />
            ),
            children: [
              {
                path: "/estadistica/informes/facturas-detalladas",
                element: <DetailedInvoicesPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.vitalSignsView} />,
            children: [
              {
                path: "/estadistica/informes/signos-vitales",
                element: <VitalSignsPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.labConsumptionView} />,
            children: [
              {
                path: "/estadistica/administrativa/consumo-laboratorio",
                element: <LabConsumptionPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.generalConsumptionView} />,
            children: [
              {
                path: "/estadistica/administrativa/consumo-general",
                element: <GeneralConsumptionPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.generalBillingView} />,
            children: [
              {
                path: "/estadistica/administrativa/facturacion-general",
                element: <GeneralBillingPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.sivigilaView} />,
            children: [
              {
                path: "/estadistica/administrativa/notificacion-sivigila",
                element: <SivigilaPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.admissionsView} />,
            children: [
              {
                path: "/estadistica/informes/admisiones",
                element: <AdmissionsPage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.triageView} />,
            children: [
              {
                path: "/estadistica/informes/triaje",
                element: <TriagePage />,
              },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.usersView} />,
            children: [
              { path: "/configuracion/usuarios", element: <UsersPage /> },
            ],
          },
          {
            element: (
              <RequirePermission permission={PERMISSIONS.permissionsView} />
            ),
            children: [
              { path: "/configuracion/permisos", element: <PermissionsPage /> },
            ],
          },
          {
            element: <RequirePermission permission={PERMISSIONS.rolesView} />,
            children: [
              { path: "/configuracion/roles", element: <RolesPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: "/signin", element: <SignInPage /> }],
      },
    ],
  },
  { path: "*", element: <Error404Page /> },
];
