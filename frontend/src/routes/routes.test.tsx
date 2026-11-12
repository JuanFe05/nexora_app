// @vitest-environment jsdom
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "./index";

const { auth } = vi.hoisted(() => ({
  auth: {
    status: "authenticated",
    permissions: [] as string[],
    hasPermission: (code: string): boolean => auth.permissions.includes(code),
  },
}));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/components/layout/app-layout", () => ({
  default: () => <Outlet />,
}));
vi.mock("@/pages/others/auth/layout", () => ({ default: () => <Outlet /> }));
// Estas pruebas cubren el enrutamiento y los guards, no el contenido: las páginas reales se cubren en su feature.
vi.mock("@/features/profile/pages/profile-page", () => ({
  default: () => <h1>Perfil de usuario</h1>,
}));
vi.mock("@/features/users/pages/users-page", () => ({
  default: () => <h1>Usuarios</h1>,
}));
vi.mock("@/features/permissions/pages/permissions-page", () => ({
  default: () => <h1>Permisos</h1>,
}));
vi.mock("@/features/roles/pages/roles-page", () => ({
  default: () => <h1>Roles</h1>,
}));
vi.mock(
  "@/features/statistics/detailed-invoices/pages/detailed-invoices-page",
  () => ({ default: () => <h1>Facturas Detalladas</h1> }),
);
vi.mock("@/features/statistics/vital-signs/pages/vital-signs-page", () => ({ default: () => <h1>Signos Vitales</h1> }));
afterEach(cleanup);
beforeEach(() => {
  auth.status = "authenticated";
  auth.permissions = [];
});

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <HelmetProvider>
      <ToastProvider>
        <Suspense fallback="Cargando">
          <RouterProvider router={router} />
        </Suspense>
      </ToastProvider>
    </HelmetProvider>,
  );
  return router;
}

const settings = [
  ["perfil", "Perfil de usuario"],
  ["usuarios", "Usuarios"],
  ["permisos", "Permisos"],
  ["roles", "Roles"],
];
describe("páginas protegidas", () => {
  it("permite Signos Vitales con su permiso independiente", async () => {
    auth.permissions = ["statistics.reports.vital_signs.view"];
    mount("/estadistica/informes/signos-vitales");
    expect(await screen.findByRole("heading", { name: "Signos Vitales" })).toBeVisible();
  });
  it.each([{ permissions: [] }, { permissions: ["statistics.reports.detailed_invoices.view"] }])("redirige Signos Vitales sin su permiso: $permissions", async ({ permissions }) => {
    auth.permissions = permissions;
    const router = mount("/estadistica/informes/signos-vitales");
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("REPLACE");
  });
  it("exige sesión antes del permiso de Signos Vitales", async () => {
    auth.status = "anonymous";
    auth.permissions = ["statistics.reports.vital_signs.view"];
    const router = mount("/estadistica/informes/signos-vitales");
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/signin");
  });
  it("permite Facturas Detalladas únicamente con su permiso efectivo", async () => {
    auth.permissions = ["statistics.reports.detailed_invoices.view"];
    mount("/estadistica/informes/facturas-detalladas");
    expect(
      await screen.findByRole("heading", { name: "Facturas Detalladas" }),
    ).toBeVisible();
  });
  it("redirige Facturas Detalladas sin permiso a Inicio", async () => {
    auth.permissions = ["identity.users.view"];
    const router = mount("/estadistica/informes/facturas-detalladas");
    expect(
      await screen.findByRole("heading", { name: "Inicio" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("REPLACE");
  });
  it("protege Facturas Detalladas con sesión antes del permiso", async () => {
    auth.status = "anonymous";
    auth.permissions = ["statistics.reports.detailed_invoices.view"];
    const router = mount("/estadistica/informes/facturas-detalladas");
    expect(
      await screen.findByRole("button", { name: "Iniciar sesión" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/signin");
  });
  it("conserva Inicio y su marcador", async () => {
    mount("/");
    expect(
      await screen.findByRole("heading", { name: "Inicio" }),
    ).toBeVisible();
    expect(screen.getByText("Página en blanco")).toBeVisible();
  });
  it("perfil disponible para cualquier usuario autenticado", async () => {
    mount("/configuracion/perfil");
    expect(
      await screen.findByRole("heading", { name: "Perfil de usuario" }),
    ).toBeVisible();
  });
  it.each(settings)(
    "permiso view permite /configuracion/%s",
    async (path, title) => {
      const resource = {
        usuarios: "users",
        permisos: "permissions",
        roles: "roles",
      }[path];
      auth.permissions = resource ? [`identity.${resource}.view`] : [];
      mount(`/configuracion/${path}`);
      expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    },
  );
  it.each(["usuarios", "permisos", "roles"])(
    "sin view redirige desde %s a Inicio aunque tenga delete",
    async (path) => {
      auth.permissions = [
        "identity.users.delete",
        "identity.roles.delete",
        "identity.permissions.delete",
      ];
      const router = mount(`/configuracion/${path}`);
      expect(
        await screen.findByRole("heading", { name: "Inicio" }),
      ).toBeVisible();
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.historyAction).toBe("REPLACE");
    },
  );
  it.each(settings)(
    "protege %s sin conservar un destino de retorno",
    async (path) => {
      auth.status = "anonymous";
      const destination = `/configuracion/${path}?pagina=2#datos`;
      const router = mount(destination);
      expect(
        await screen.findByRole("button", { name: "Iniciar sesión" }),
      ).toBeVisible();
      expect(router.state.location.pathname).toBe("/signin");
      expect(router.state.location.state).toBeNull();
    },
  );
  it("mantiene el estado de carga y no expone páginas protegidas", () => {
    auth.status = "loading";
    mount("/configuracion/usuarios");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando sesión…");
    expect(
      screen.queryByRole("heading", { name: "Usuarios" }),
    ).not.toBeInTheDocument();
  });
  it("conserva redirección de visitante autenticado desde signin", async () => {
    const router = mount("/signin");
    expect(
      await screen.findByRole("heading", { name: "Inicio" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
  });
});
