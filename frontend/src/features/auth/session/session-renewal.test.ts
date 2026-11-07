// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/http/api-error";
import { createAuthSession } from "./auth-session";
import { createTokenStore } from "./token-store";

const principal = { usuario: { id: "1", nombre_usuario: "ana", correo: "ana@example.test", nombre_completo: "Ana" }, roles: ["lector"], permisos: ["read"] };
const tokens = { access_token: "token", token_type: "bearer", expires_in: 60 };
const cleanups: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.useRealTimers(); });
async function setup(options?: Parameters<typeof createAuthSession>[2], watch = false) {
  const api = { login: vi.fn().mockResolvedValue(tokens), refresh: vi.fn().mockResolvedValue(tokens), me: vi.fn().mockResolvedValue(principal), logout: vi.fn().mockResolvedValue(undefined), logoutAll: vi.fn().mockResolvedValue(undefined) };
  const store = createTokenStore();
  const session = createAuthSession(api, store, options);
  await session.login({ identificador: "ana", contrasena: "test" });
  api.me.mockClear();
  if (watch) cleanups.push(session.watchPrincipal(window, document));
  return { api, store, session };
}

it.each([0, 500, 503, 429, 422])("refresh %s reintenta con backoff, conserva estado y permite otra solicitud", async (status) => {
  const { api, store, session } = await setup();
  const snapshot = session.getSnapshot();
  const expired = vi.fn(); session.subscribeExpired(expired);
  api.refresh.mockRejectedValue(new ApiError(status, "temporal", null));
  const first = session.refresh();
  const outcome = expect(first).rejects.toMatchObject({ status: 0 });
  expect(session.refresh()).toBe(first);
  expect(api.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(249); expect(api.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(api.refresh).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(499); expect(api.refresh).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1); await outcome;
  expect(api.refresh).toHaveBeenCalledTimes(3);
  expect(api.me).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toBe(snapshot); expect(store.getAccessToken()).toBe("token");
  expect(expired).not.toHaveBeenCalled();
  api.refresh.mockResolvedValue(tokens); await session.refresh();
  expect(api.refresh).toHaveBeenCalledTimes(4); expect(session.getSnapshot().status).toBe("authenticated");
});
it.each([401, 403])("refresh %s definitivo borra principal/token y señala expiración una vez", async (status) => {
  const { api, store, session } = await setup();
  const expired = vi.fn(); const off = session.subscribeExpired(expired);
  api.refresh.mockRejectedValue(new ApiError(status, "expiró", null));
  await expect(session.refresh()).rejects.toMatchObject({ status });
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(api.me).not.toHaveBeenCalled();
  expect(store.getAccessToken()).toBeNull();
  expect(session.getSnapshot()).toEqual({ status: "anonymous", user: null, roles: [], permissions: [] });
  expect(expired).toHaveBeenCalledTimes(1); off();
  await session.logout(); expect(expired).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 500, 0])("me después de refresh %s solo invalida con 401", async (status) => {
  const { api, store, session } = await setup(); const snapshot = session.getSnapshot();
  const expired = vi.fn(); session.subscribeExpired(expired);
  api.me.mockRejectedValue(new ApiError(status, "error", null));
  const outcome = expect(session.refresh()).rejects.toMatchObject({ status: status === 401 ? 401 : 0 });
  await vi.advanceTimersByTimeAsync(750); await outcome;
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(api.me).toHaveBeenCalledTimes(status === 401 ? 1 : 3);
  expect(session.getSnapshot()).toBe(status === 401 ? session.getSnapshot() : snapshot);
  expect(session.getSnapshot().status).toBe(status === 401 ? "anonymous" : "authenticated");
  expect(store.getAccessToken()).toBe(status === 401 ? null : "token");
  expect(expired).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
});
it.each(["pointerdown", "keydown", "wheel", "scroll", "touchstart", "api"])("renueva solo con actividad %s desde la última renovación", async (event) => {
  const { api, session } = await setup({ createChannel: () => undefined }, true);
  await vi.advanceTimersByTimeAsync(30_000); expect(api.refresh).not.toHaveBeenCalled();
  if (event === "api") session.onActivity(); else window.dispatchEvent(new Event(event));
  await vi.advanceTimersByTimeAsync(1); expect(api.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120_000); expect(api.refresh).toHaveBeenCalledTimes(1);
});
it("focus renueva un token vencido con actividad y desmontar elimina timers/listeners", async () => {
  const { api, session } = await setup({ createChannel: () => undefined });
  const stop = session.watchPrincipal(window, document);
  window.dispatchEvent(new Event("keydown"));
  vi.setSystemTime(Date.now() + 61_000);
  window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(0);
  expect(api.refresh).toHaveBeenCalledTimes(1);
  stop(); window.dispatchEvent(new Event("keydown"));
  await vi.advanceTimersByTimeAsync(120_000); window.dispatchEvent(new Event("focus"));
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it("focus/visibility sin actividad no renuevan aunque el token esté vencido", async () => {
  const { api } = await setup({ createChannel: () => undefined }, true);
  api.me.mockRejectedValue(new ApiError(401, "expiró", null));
  await vi.advanceTimersByTimeAsync(61_000);
  window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(api.refresh).not.toHaveBeenCalled(); expect(api.me).not.toHaveBeenCalled();
});
it("desmontar durante backoff cancela timers y no sigue reintentando", async () => {
  const { api, session } = await setup({ createChannel: () => undefined });
  const stop = session.watchPrincipal(window, document);
  api.refresh.mockRejectedValue(new ApiError(503, "temporal", null));
  window.dispatchEvent(new Event("keydown"));
  await vi.advanceTimersByTimeAsync(30_000); expect(api.refresh).toHaveBeenCalledTimes(1);
  stop(); await vi.advanceTimersByTimeAsync(750);
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  expect(session.getSnapshot().status).toBe("authenticated");
});
it("desmontar durante restauración cancela también su backoff sin hacer anónima la sesión", async () => {
  const { api } = await setup();
  api.refresh.mockRejectedValue(new ApiError(0, "red", null));
  const session = createAuthSession(api, createTokenStore(), { createChannel: () => undefined });
  const stop = session.watchPrincipal(window, document);
  const restoring = session.restore(); await vi.advanceTimersByTimeAsync(0);
  stop(); await vi.advanceTimersByTimeAsync(750); await restoring;
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  expect(session.getSnapshot().status).toBe("loading");
});
it("restauración sobrevive al cleanup/remount de StrictMode", async () => {
  const { api } = await setup();
  const session = createAuthSession(api, createTokenStore(), { createChannel: () => undefined });
  const stop = session.watchPrincipal(window, document);
  const restoring = session.restore(); stop();
  cleanups.push(session.watchPrincipal(window, document));
  await session.restore(); await restoring;
  expect(session.getSnapshot().status).toBe("authenticated");
  const count = api.refresh.mock.calls.length;
  await session.restore(); expect(api.refresh).toHaveBeenCalledTimes(count);
});
it("logout durante backoff invalida la petición sin timers ni aviso de expiración", async () => {
  const { api, store, session } = await setup(); const expired = vi.fn(); session.subscribeExpired(expired);
  api.refresh.mockRejectedValue(new ApiError(0, "red", null));
  const flight = session.refresh().catch(() => undefined);
  await vi.advanceTimersByTimeAsync(0); await session.logout(); await flight;
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  expect(store.getAccessToken()).toBeNull(); expect(expired).not.toHaveBeenCalled();
});
it("logout cancela renovación y listeners", async () => {
  const { api, session } = await setup({ createChannel: () => undefined }, true);
  window.dispatchEvent(new Event("keydown")); await session.logout();
  window.dispatchEvent(new Event("keydown")); await vi.advanceTimersByTimeAsync(120_000);
  expect(api.refresh).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it.each([true, false])("single-flight usa Web Locks si existe (%s) y fallback si no", async (available) => {
  const request = vi.fn(async (_name: string, callback: () => Promise<void>) => callback());
  const { api, session } = await setup({ locks: available ? { request } : null });
  await Promise.all([session.refresh(), session.refresh()]);
  expect(api.refresh).toHaveBeenCalledTimes(1); expect(api.me).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(available ? 1 : 0);
  if (available) expect(request).toHaveBeenCalledWith("nexora-auth-refresh", expect.any(Function));
});
it.each(["logout", "logoutAll"] as const)("%s difunde cierre sin tokens y receptor no hace eco", async (method) => {
  const channels: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (data: unknown) => void; close: () => void }[] = [];
  const createChannel = () => {
    const channel: (typeof channels)[number] = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: vi.fn((data: unknown) => channels.filter((other) => other !== channel).forEach((other) => other.onmessage?.({ data }))), close: vi.fn() };
    channels.push(channel); return channel;
  };
  const first = await setup({ createChannel }, true); const second = await setup({ createChannel }, true);
  await first.session[method]();
  expect(first.api[method]).toHaveBeenCalledTimes(1);
  for (const tab of [first, second]) { expect(tab.store.getAccessToken()).toBeNull(); expect(tab.session.getSnapshot().status).toBe("anonymous"); }
  expect(channels[0].postMessage).toHaveBeenCalledExactlyOnceWith({ type: "logout" });
  expect(channels[1].postMessage).not.toHaveBeenCalled(); expect(second.api.logout).not.toHaveBeenCalled();
  for (const channel of channels) expect(channel.close).toHaveBeenCalledTimes(1);
});
it("logoutAll fallido conserva sesión y no difunde cierre", async () => {
  const postMessage = vi.fn(); const close = vi.fn();
  const { api, store, session } = await setup({ createChannel: () => ({ onmessage: null, postMessage, close }) }, true);
  const snapshot = session.getSnapshot(); const error = new ApiError(0, "red", null);
  api.logoutAll.mockRejectedValue(error);
  await expect(session.logoutAll()).rejects.toBe(error);
  expect(api.logoutAll).toHaveBeenCalledTimes(1); expect(session.getSnapshot()).toBe(snapshot);
  expect(store.getAccessToken()).toBe("token"); expect(postMessage).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
