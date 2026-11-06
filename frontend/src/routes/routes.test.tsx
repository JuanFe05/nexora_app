// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "./index";

const { auth } = vi.hoisted(() => ({ auth: { status: "authenticated", roles: [] as string[] } }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/components/layout/app-layout", () => ({ default: () => <Outlet /> }));
vi.mock("@/pages/others/auth/layout", () => ({ default: () => <Outlet /> }));
// Estas pruebas cubren el enrutamiento y los guards, no el contenido: las páginas reales se cubren en su feature.
vi.mock("@/features/profile/pages/profile-page", () => ({ default: () => <h1>Perfil de usuario</h1> }));
vi.mock("@/features/users/pages/users-page", () => ({ default: () => <h1>Usuarios</h1> }));
vi.mock("@/features/permissions/pages/permissions-page", () => ({ default: () => <h1>Permisos</h1> }));
vi.mock("@/features/roles/pages/roles-page", () => ({ default: () => <h1>Roles</h1> }));
afterEach(cleanup);
beforeEach(() => { auth.status = "authenticated"; auth.roles = []; });

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<HelmetProvider><Suspense fallback="Cargando"><RouterProvider router={router} /></Suspense></HelmetProvider>);
  return router;
}

const settings = [["perfil", "Perfil de usuario"], ["usuarios", "Usuarios"], ["permisos", "Permisos"], ["roles", "Roles"]];
describe("páginas protegidas", () => {
  it("conserva Inicio y su marcador", async () => {
    mount("/");
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
    expect(screen.getByText("Página en blanco")).toBeVisible();
  });
  it("perfil disponible para cualquier usuario autenticado", async () => {
    mount("/configuracion/perfil");
    expect(await screen.findByRole("heading", { name: "Perfil de usuario" })).toBeVisible();
  });
  it.each(settings)("administrador accede a /configuracion/%s", async (path, title) => {
    auth.roles = ["ADMINISTRADOR"];
    mount(`/configuracion/${path}`);
    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
  });
  it.each(["usuarios", "permisos", "roles"])("redirige no administrador desde %s a Inicio", async (path) => {
    auth.roles = ["ESTADISTICA"];
    const router = mount(`/configuracion/${path}`);
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("REPLACE");
  });
  it.each(settings)("protege %s y conserva consulta y fragmento", async (path) => {
    auth.status = "anonymous";
    const destination = `/configuracion/${path}?pagina=2#datos`;
    const router = mount(destination);
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/signin");
    expect(router.state.location.state).toMatchObject({ from: destination });
  });
  it("mantiene el estado de carga y no expone páginas protegidas", () => {
    auth.status = "loading";
    mount("/configuracion/usuarios");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando sesión…");
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });
  it("conserva redirección de visitante autenticado desde signin", async () => {
    const router = mount("/signin");
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
  });
});
