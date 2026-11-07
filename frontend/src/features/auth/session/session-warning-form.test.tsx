// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionExpiryDialog } from "../../../components/shared/session-expiry-dialog";
import { ToastProvider } from "../../../components/shared/toast/toast-provider";
import { SessionExpiryNotice } from "../components/session-expiry-notice";
import { ApiError } from "../../../lib/http/api-error";
import { AuthContext } from "../auth-context";
import { ProtectedRoute } from "../components/route-guards";
import { createAuthSession } from "./auth-session";
import { createTokenStore } from "./token-store";

const title = "Tu sesión está por expirar. ¿Deseas continuar trabajando?";
const principal = { usuario: { id: "1", nombre_usuario: "ana", correo: "ana@example.test", nombre_completo: "Ana" }, roles: [], permisos: [] };
const tokens = { access_token: "synthetic", token_type: "bearer", expires_in: 600, idle_timeout_seconds: 120, warning_seconds: 30, session_expires_at: new Date(600_000).toISOString() };
let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { cleanup(); stop?.(); stop = undefined; vi.useRealTimers(); });
function Form() {
  const [value, setValue] = useState("");
  return <label>Borrador<input value={value} onChange={(event) => setValue(event.target.value)} /></label>;
}
function Provider({ session, children }: { session: ReturnType<typeof createAuthSession>; children: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <AuthContext value={{ ...state, login: session.login, logout: session.logout, logoutAll: session.logoutAll, hasPermission: session.hasPermission, reloadPrincipal: session.reloadPrincipal }}>{children}</AuthContext>;
}
async function setup() {
  const api = { login: vi.fn().mockResolvedValue(tokens), refresh: vi.fn().mockResolvedValue(tokens), me: vi.fn().mockResolvedValue(principal), logout: vi.fn().mockResolvedValue(undefined), logoutAll: vi.fn().mockResolvedValue(undefined) };
  const session = createAuthSession(api, createTokenStore(), { locks: null, createChannel: () => undefined });
  await session.login({ identificador: "ana", contrasena: "test" }); stop = session.watchPrincipal(window, document);
  const router = createMemoryRouter([{ element: <ProtectedRoute />, children: [{ path: "/edit", element: <Form /> }] }, { path: "/signin", element: <p>Login</p> }], { initialEntries: ["/edit"] });
  const view = render(<ToastProvider><SessionExpiryNotice session={session} /><Provider session={session}><RouterProvider router={router} /><SessionExpiryDialog session={session} /></Provider></ToastProvider>);
  const input = screen.getByRole("textbox", { name: "Borrador" }); fireEvent.change(input, { target: { value: "trabajo sin guardar" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
  return { api, session, router, input, ...view };
}
it("aviso modal conserva el mismo formulario, cuenta cada segundo y Escape/exterior no cierran", async () => {
  const { input, session, router, unmount } = await setup();
  const dialog = screen.getByRole("alertdialog", { name: title }); expect(dialog).toBeVisible();
  expect(screen.getByRole("timer")).toHaveTextContent("00:30");
  expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
  fireEvent.keyDown(dialog, { key: "Escape" }); fireEvent.pointerDown(document.body); fireEvent.click(document.body);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("timer")).toHaveTextContent("00:29"); expect(screen.getByRole("alertdialog")).toBe(dialog);
  expect(input.isConnected).toBe(true); expect(input).toHaveValue("trabajo sin guardar"); expect(router.state.location.pathname).toBe("/edit");
  expect(session.getSnapshot().status).toBe("authenticated");
  unmount(); stop?.(); stop = undefined; await vi.advanceTimersByTimeAsync(1000); expect(vi.getTimerCount()).toBe(0);
});
it("Continuar sesión comparte una sola renovación y cierra sin perder formulario", async () => {
  const { api, session, input } = await setup();
  let resolve!: (result: typeof tokens) => void; api.refresh.mockImplementation(() => new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar sesión" }));
  expect(screen.getByRole("button", { name: "Continuar sesión" })).toBeDisabled();
  const concurrent = session.refresh(); expect(api.refresh).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(tokens); await concurrent; });
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(screen.getByRole("textbox")).toBe(input); expect(input).toHaveValue("trabajo sin guardar");
  expect(session.getWarningSnapshot()).toEqual({ open: false, deadlineAt: 210_000 });
});
it("fallo transitorio muestra error inline sin borrar auth y permite reintentar", async () => {
  const { api, session, input } = await setup(); const state = session.getSnapshot(); api.refresh.mockRejectedValue(new ApiError(503, "temporal", null));
  fireEvent.click(screen.getByRole("button", { name: "Continuar sesión" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo renovar la sesión. Intenta de nuevo."); expect(api.refresh).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("alertdialog")).toBeVisible(); expect(session.getSnapshot()).toBe(state); expect(input).toHaveValue("trabajo sin guardar");
  expect(screen.queryByText("Login")).not.toBeInTheDocument();
  api.refresh.mockResolvedValue(tokens); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar sesión" })); });
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("si refresh funciona pero /me falla temporalmente, la sesión ya se renovó: cierra el aviso sin perder auth ni formulario", async () => {
  const { api, session, input, router } = await setup(); const state = session.getSnapshot();
  api.me.mockRejectedValue(new ApiError(503, "temporal", null));
  fireEvent.click(screen.getByRole("button", { name: "Continuar sesión" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(session.getSnapshot().status).toBe("authenticated"); expect(session.getSnapshot().user).toBe(state.user);
  expect(screen.getByRole("textbox")).toBe(input); expect(input).toHaveValue("trabajo sin guardar");
  expect(router.state.location.pathname).toBe("/edit"); expect(screen.queryByText("Login")).not.toBeInTheDocument();
});
it.each([401, 403, "zero", "logout"] as const)("%s cierra y redirige; solo expiración muestra el toast existente", async (reason) => {
  const { api, session, router } = await setup();
  if (reason === "zero") await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  else if (reason === "logout") await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" })); });
  else { api.refresh.mockRejectedValue(new ApiError(reason, "expirada", null)); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continuar sesión" })); }); }
  expect(session.getSnapshot().status).toBe("anonymous"); expect(router.state.location.pathname).toBe("/signin"); expect(screen.getByText("Login")).toBeVisible();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(api.logout).toHaveBeenCalledTimes(reason === "logout" ? 1 : 0);
  if (reason === "logout") expect(screen.queryByText("Tu sesión expiró")).not.toBeInTheDocument(); else expect(screen.getByText("Tu sesión expiró")).toBeVisible();
});
