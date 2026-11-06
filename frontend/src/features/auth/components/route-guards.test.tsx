// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ProtectedRoute, PublicOnlyRoute, RequirePermission } from "./route-guards";

const { auth, listeners } = vi.hoisted(() => ({ listeners: new Set<() => void>(), auth: { status: "authenticated", permissions: [] as string[], hasPermission: (code: string): boolean => auth.permissions.includes(code) } }));
vi.mock("../use-auth", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useAuth: () => {
    useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => auth.status);
    return auth;
  } };
});
afterEach(cleanup);

it.each([
  { permissions: ["identity.roles.view"], allowed: true },
  { permissions: ["identity.roles.delete"], allowed: false },
  { permissions: [], allowed: false },
])("RequirePermission exige el permiso exacto: $permissions", async ({ permissions, allowed }) => {
  auth.status = "authenticated";
  auth.permissions = permissions;
  const router = createMemoryRouter([
    { path: "/", element: <h1>Inicio</h1> },
    { element: <RequirePermission permission="identity.roles.view" />, children: [{ path: "/admin", element: <h1>Administración</h1> }] },
  ], { initialEntries: ["/admin"] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("heading", { name: allowed ? "Administración" : "Inicio" })).toBeVisible();
  expect(router.state.location.pathname).toBe(allowed ? "/admin" : "/");
  if (!allowed) expect(router.state.historyAction).toBe("REPLACE");
});

it.each([undefined, "/configuracion/roles?pagina=2#datos", "https://example.test/", "/signin"])("signin autenticado siempre aterriza en Inicio, incluso con from=%s", async (from) => {
  auth.status = "authenticated";
  const router = createMemoryRouter([
    { path: "/", element: <h1>Inicio</h1> },
    { element: <PublicOnlyRoute />, children: [{ path: "/signin", element: <h1>Acceso</h1> }] },
  ], { initialEntries: [{ pathname: "/signin", state: { from } }] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
  expect(router.state.location).toMatchObject({ pathname: "/", search: "", hash: "", state: null });
  expect(router.state.historyAction).toBe("REPLACE");
});

it("tras login no recupera la ruta solicitada antes del acceso", async () => {
  auth.status = "anonymous";
  const router = createMemoryRouter([
    { element: <ProtectedRoute />, children: [{ path: "/", element: <h1>Inicio</h1> }, { path: "/privado", element: <h1>Privado</h1> }] },
    { element: <PublicOnlyRoute />, children: [{ path: "/signin", element: <h1>Acceso</h1> }] },
  ], { initialEntries: ["/privado?pagina=2#datos"] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("heading", { name: "Acceso" })).toBeVisible();
  expect(router.state.location.state).toBeNull();
  act(() => { auth.status = "authenticated"; listeners.forEach((listener) => listener()); });
  expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/");
});
