// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/layout/app-layout/sidebar";
import { AuthProvider } from "./auth-provider";
import { RequirePermission } from "./components/route-guards";
import { authSession } from "./session/session";
import { useAuth } from "./use-auth";

const { api, principal } = vi.hoisted(() => {
  const principal = { usuario: { id: "1", nombre_usuario: "ana", correo: "ana@example.test", nombre_completo: "Ana" }, roles: ["lector"], permisos: ["identity.roles.view"] };
  return { principal, api: { login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), me: vi.fn() } };
});
vi.mock("./api/auth-api", () => ({ authApi: api }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
beforeEach(async () => {
  vi.useFakeTimers();
  await authSession.logout();
  api.login.mockResolvedValue({ access_token: "token" });
  api.refresh.mockResolvedValue({ access_token: "token" });
  api.me.mockResolvedValue(structuredClone(principal));
  await authSession.login({ identificador: "ana", contrasena: "test" });
  await authSession.restore();
  api.me.mockClear();
});
afterEach(async () => { cleanup(); await authSession.logout(); vi.clearAllMocks(); vi.useRealTimers(); });

function Controls() {
  const { hasPermission, reloadPrincipal } = useAuth();
  return <><button onClick={() => void reloadPrincipal()}>Actualizar sesión</button>{hasPermission("identity.roles.delete") && <button>Eliminar rol</button>}</>;
}
function mount() {
  const router = createMemoryRouter([
    { element: <SidebarProvider><AppSidebar /><Controls /><Outlet /></SidebarProvider>, children: [
      { path: "/", element: <h1>Inicio</h1> },
      { element: <RequirePermission permission="identity.roles.view" />, children: [{ path: "/roles", element: <h1>Módulo de roles</h1> }] },
    ] },
  ], { initialEntries: ["/roles"] });
  const view = render(<AuthProvider><RouterProvider router={router} /></AuthProvider>);
  return { ...view, router };
}

it("reloadPrincipal público actualiza sidebar, guard y acciones sin volver a iniciar sesión", async () => {
  const { router } = mount();
  expect(screen.getByRole("heading", { name: "Módulo de roles" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Roles" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Eliminar rol" })).not.toBeInTheDocument();
  api.me.mockResolvedValue({ ...principal, permisos: ["identity.users.view", "identity.roles.delete"] });
  await act(async () => { screen.getByRole("button", { name: "Actualizar sesión" }).click(); });
  expect(screen.queryByRole("link", { name: "Roles" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Usuarios" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Eliminar rol" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Inicio" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/");
  expect(router.state.historyAction).toBe("REPLACE");
  expect(api.login).toHaveBeenCalledTimes(1);
  expect(api.me).toHaveBeenCalledTimes(1);
});

it("focus/visibility solo recargan autenticado, visibles y como máximo cada 30 segundos; limpia listeners", async () => {
  const { unmount } = mount();
  const visibility = vi.spyOn(document, "visibilityState", "get");
  visibility.mockReturnValue("hidden");
  await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  expect(api.me).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  expect(api.me).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999); window.dispatchEvent(new Event("focus")); });
  expect(api.me).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); window.dispatchEvent(new Event("focus")); });
  expect(api.me).toHaveBeenCalledTimes(2);
  unmount();
  await vi.advanceTimersByTimeAsync(30_000);
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(api.me).toHaveBeenCalledTimes(2);
  visibility.mockRestore();
});

it("un burst de 403 del cliente compartido recarga una vez y me=403 no genera un bucle", async () => {
  mount();
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ detail: "Sin permiso" }, { status: 403 }));
  vi.stubGlobal("fetch", fetchImpl);
  const { httpClient } = await import("@/lib/http/http-client");
  api.me.mockImplementation(() => httpClient.get("/auth/me"));
  try {
    await act(async () => {
      await Promise.allSettled([httpClient.get("/roles"), httpClient.get("/users"), httpClient.get("/permissions")]);
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(api.me).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.filter(([url]) => typeof url === "string" && url.endsWith("/auth/me"))).toHaveLength(1);
    expect(authSession.getSnapshot().status).toBe("authenticated");
  } finally { vi.unstubAllGlobals(); }
});

it("desmontar cancela una recarga 403 pendiente y una sesión anónima ignora focus", async () => {
  const { unmount } = mount();
  authSession.onForbidden();
  unmount();
  await vi.advanceTimersByTimeAsync(100);
  expect(api.me).not.toHaveBeenCalled();
  render(<AuthProvider><p>Sesión</p></AuthProvider>);
  await act(async () => { await authSession.logout(); window.dispatchEvent(new Event("focus")); });
  expect(api.me).not.toHaveBeenCalled();
});
