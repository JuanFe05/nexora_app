// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/http/api-error";
import { createHttpClient } from "../../../lib/http/http-client";
import { AuthContext } from "../auth-context";
import { ProtectedRoute } from "../components/route-guards";
import { createAuthSession } from "./auth-session";
import { createTokenStore } from "./token-store";

const principal = { usuario: { id: "1", nombre_usuario: "ana", correo: "ana@example.test", nombre_completo: "Ana" }, roles: [], permisos: [] };
const tokens = { access_token: "synthetic", token_type: "bearer", expires_in: 60 };
let stop: (() => void) | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); stop?.(); stop = undefined; vi.useRealTimers(); });

function Form() {
  const [value, setValue] = useState("");
  return <form><label>Borrador<input value={value} onChange={(event) => setValue(event.target.value)} /></label></form>;
}
function Provider({ session, children }: { session: ReturnType<typeof createAuthSession>; children: ReactNode }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <AuthContext value={{ ...state, login: session.login, logout: session.logout, logoutAll: session.logoutAll, hasPermission: session.hasPermission, reloadPrincipal: session.reloadPrincipal }}>{children}</AuthContext>;
}

it.each(["proactive", "401", "network"])("%s conserva el formulario montado, la ruta y el estado autenticado", async (mode) => {
  const api = { login: vi.fn().mockResolvedValue(tokens), refresh: vi.fn().mockResolvedValue(tokens), me: vi.fn().mockResolvedValue(principal), logout: vi.fn().mockResolvedValue(undefined), logoutAll: vi.fn().mockResolvedValue(undefined) };
  const store = createTokenStore();
  const session = createAuthSession(api, store, { locks: null, createChannel: () => undefined });
  await session.login({ identificador: "ana", contrasena: "test" });
  stop = session.watchPrincipal(window, document);
  const statuses: string[] = []; session.subscribe(() => statuses.push(session.getSnapshot().status));
  const router = createMemoryRouter([
    { element: <ProtectedRoute />, children: [{ path: "/edit", element: <Form /> }] },
    { path: "/signin", element: <p>Login</p> },
  ], { initialEntries: ["/edit"] });
  render(<Provider session={session}><RouterProvider router={router} /></Provider>);
  const input = screen.getByRole("textbox", { name: "Borrador" });
  fireEvent.change(input, { target: { value: "trabajo sin guardar" } });
  const snapshot = session.getSnapshot();
  if (mode === "network") api.refresh.mockRejectedValue(new ApiError(0, "red", null));
  if (mode === "401") {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json({ saved: true }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: store.getAccessToken, refreshSession: session.refresh, onActivity: session.onActivity });
    await act(async () => { expect(await client.post("draft", { body: { text: "trabajo sin guardar" } })).toEqual({ saved: true }); });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) expect(init).toMatchObject({ method: "POST", body: '{"text":"trabajo sin guardar"}', credentials: "include" });
  } else {
    fireEvent.keyDown(input, { key: "a" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole("textbox")).toBe(input);
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    if (mode === "network") {
      api.refresh.mockResolvedValue(tokens);
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(api.refresh).toHaveBeenCalledTimes(4);
    }
  }
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("trabajo sin guardar");
  expect(router.state.location.pathname).toBe("/edit");
  expect(session.getSnapshot()).toBe(snapshot);
  expect(statuses).toEqual([]); expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(api.refresh).toHaveBeenCalledTimes(mode === "network" ? 4 : 1);
  stop(); stop = undefined; expect(vi.getTimerCount()).toBe(0);
});
