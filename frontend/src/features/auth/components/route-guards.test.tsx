// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import { changePassword } from "@/features/profile/api/profile-api";
import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ProtectedRoute, PublicOnlyRoute, RequirePermission } from "./route-guards";

const { auth, listeners } = vi.hoisted(() => ({ listeners: new Set<() => void>(), auth: { status: "authenticated", passwordChangeRequired: false, reloadPrincipal: vi.fn(), permissions: [] as string[], hasPermission: (code: string): boolean => auth.permissions.includes(code) } }));
vi.mock("@/features/profile/api/profile-api", { spy: true });
vi.mock("../use-auth", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useAuth: () => {
    useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => `${auth.status}:${auth.passwordChangeRequired}`);
    return auth;
  } };
});
afterEach(() => { cleanup(); auth.passwordChangeRequired = false; });

it("does not mount protected content until the server confirms the password change", async () => {
  auth.status = "authenticated";
  auth.passwordChangeRequired = true;
  const router = createMemoryRouter([
    { element: <ProtectedRoute />, children: [{ path: "/privado", element: <h1>Privado</h1> }] },
  ], { initialEntries: ["/privado"] });
  vi.mocked(changePassword).mockResolvedValueOnce(undefined);
  auth.reloadPrincipal.mockReset().mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
    auth.passwordChangeRequired = false;
    listeners.forEach(listener => listener());
  });
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  expect(await screen.findByRole("heading", { name: "Cambio de contraseña obligatorio" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Privado" })).not.toBeInTheDocument();

  for (const [label, value] of [[/^Contraseña temporal/, "Temporal123!"], [/^Nueva contraseña/, "Personal123!"], [/^Confirmar contraseña/, "Personal123!"]] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  const retry = await screen.findByRole("button", { name: "Verificar acceso" });
  expect(changePassword).toHaveBeenCalledExactlyOnceWith({ contrasena_actual: "Temporal123!", contrasena_nueva: "Personal123!" });
  expect(screen.queryByRole("heading", { name: "Privado" })).not.toBeInTheDocument();
  await userEvent.click(retry);
  expect(await screen.findByRole("heading", { name: "Privado" })).toBeVisible();
  expect(changePassword).toHaveBeenCalledTimes(1);
});

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
