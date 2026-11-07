// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAuthSession } from "./auth-session";
import { createTokenStore } from "./token-store";
import { createHttpClient } from "../../../lib/http/http-client";

const principal = { usuario: { id: "1", nombre_usuario: "ana", correo: "ana@example.test", nombre_completo: "Ana" }, roles: [], permisos: [] };
const tokens = { access_token: "synthetic", token_type: "bearer", expires_in: 600, idle_timeout_seconds: 120, warning_seconds: 30, session_expires_at: new Date(600_000).toISOString() };
const cleanups: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { cleanups.splice(0).forEach((stop) => stop()); vi.useRealTimers(); });
async function setup(contract: object = tokens) {
  const api = { login: vi.fn().mockResolvedValue(contract), refresh: vi.fn().mockResolvedValue(contract), me: vi.fn().mockResolvedValue(principal), logout: vi.fn().mockResolvedValue(undefined), logoutAll: vi.fn().mockResolvedValue(undefined) };
  const session = createAuthSession(api, createTokenStore(), { locks: null, createChannel: () => undefined, now: () => Date.now() });
  await session.login({ identificador: "ana", contrasena: "test" });
  cleanups.push(session.watchPrincipal(window, document));
  return { api, session };
}
it("abre exactamente al inicio del aviso, sin publicar un nuevo principal; actividad de usuario no lo cierra", async () => {
  const { api, session } = await setup(); const state = session.getSnapshot(); const listener = vi.fn(); session.subscribe(listener);
  await vi.advanceTimersByTimeAsync(89_999); expect(session.getWarningSnapshot()).toEqual({ open: false, deadlineAt: 120_000 });
  await vi.advanceTimersByTimeAsync(1); expect(session.getWarningSnapshot()).toEqual({ open: true, deadlineAt: 120_000 });
  session.onActivity(); window.dispatchEvent(new Event("keydown"));
  await vi.advanceTimersByTimeAsync(1);
  expect(session.getWarningSnapshot().open).toBe(true); expect(api.refresh).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toBe(state); expect(listener).not.toHaveBeenCalled();
});
it.each(["API", "refresh", "me"])("respuesta exitosa %s cierra y rearma el aviso", async (source) => {
  const { api, session } = await setup(); await vi.advanceTimersByTimeAsync(90_000);
  if (source === "API") {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: () => "synthetic", onServerActivity: session.onServerActivity });
    expect(await client.get("draft")).toEqual({ ok: true }); expect(fetchImpl).toHaveBeenCalledTimes(1);
  } else if (source === "refresh") await session.refresh(); else await session.reloadPrincipal();
  expect(session.getWarningSnapshot()).toEqual({ open: false, deadlineAt: 210_000 });
  await vi.advanceTimersByTimeAsync(89_999); expect(session.getWarningSnapshot().open).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(session.getWarningSnapshot().open).toBe(true);
  expect(api.refresh).toHaveBeenCalledTimes(source === "refresh" ? 1 : 0);
});
it.each([
  {}, { idle_timeout_seconds: undefined }, { warning_seconds: undefined }, { session_expires_at: undefined }, { idle_timeout_seconds: 0 }, { idle_timeout_seconds: Infinity }, { idle_timeout_seconds: "120" },
  { warning_seconds: -1 }, { warning_seconds: NaN }, { warning_seconds: "30" }, { warning_seconds: 120 },
  { session_expires_at: "invalid" }, { session_expires_at: 600_000 }, { idle_timeout_seconds: Number.MAX_VALUE },
])("contrato ausente/inválido (%j) conserva comportamiento sin aviso", async (override) => {
  const contract = Object.keys(override).length ? { ...tokens, ...override } : { access_token: "synthetic", token_type: "bearer", expires_in: 600 };
  const { session } = await setup(contract); await vi.advanceTimersByTimeAsync(120_000);
  expect(session.getWarningSnapshot().open).toBe(false); expect(session.getSnapshot().status).toBe("authenticated");
});
it("respeta el límite absoluto incluso tras renovar y expira una sola vez con limpieza", async () => {
  const { api, session } = await setup({ ...tokens, session_expires_at: new Date(100_000).toISOString() });
  const expired = vi.fn(); session.subscribeExpired(expired);
  await vi.advanceTimersByTimeAsync(70_000); expect(session.getWarningSnapshot()).toEqual({ open: true, deadlineAt: 100_000 });
  api.refresh.mockResolvedValue({ ...tokens, session_expires_at: new Date(600_000).toISOString() });
  await session.refresh(); expect(session.getWarningSnapshot().deadlineAt).toBe(100_000);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(session.getSnapshot().status).toBe("anonymous"); expect(expired).toHaveBeenCalledTimes(1);
  expect(api.logout).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("sin contrato una respuesta no rearma renovación ni abre aviso", async () => {
  const { api, session } = await setup({ access_token: "synthetic", token_type: "bearer", expires_in: 60 });
  await vi.advanceTimersByTimeAsync(30_000); expect(vi.getTimerCount()).toBe(0);
  session.onServerActivity(); expect(vi.getTimerCount()).toBe(0); expect(api.refresh).not.toHaveBeenCalled();
  expect(session.getWarningSnapshot().open).toBe(false); expect(session.getSnapshot().status).toBe("authenticated");
});
it("renovación pendiente no revive una sesión cuyo contador llegó a cero", async () => {
  const { api, session } = await setup(); const expired = vi.fn(); session.subscribeExpired(expired);
  await vi.advanceTimersByTimeAsync(90_000);
  let resolve!: (result: typeof tokens) => void; api.refresh.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const outcome = session.refresh().catch(() => undefined);
  await vi.advanceTimersByTimeAsync(30_000); resolve(tokens); await outcome;
  expect(session.getSnapshot().status).toBe("anonymous"); expect(session.getWarningSnapshot().open).toBe(false);
  expect(expired).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it.each(["unmount", "logout"])("%s cancela timers y listeners de aviso", async (reason) => {
  const { session } = await setup(); const listener = vi.fn(); const off = session.subscribeWarning(listener); off();
  if (reason === "logout") await session.logout(); else cleanups.splice(0).forEach((stop) => stop());
  await vi.advanceTimersByTimeAsync(120_000); window.dispatchEvent(new Event("keydown"));
  expect(listener).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
