import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/http/api-error";
import { createAuthSession } from "./auth-session";
import { createTokenStore } from "./token-store";

const usuario = { id: "1", nombre_usuario: "ana", correo: "ana@example.test", nombre_completo: "Ana" };
const principal = { usuario, roles: ["lector"], permisos: ["identity.roles.view"] };
const tokens = { access_token: "token", token_type: "bearer", expires_in: 600 };
async function setup() {
  const api = {
    login: vi.fn().mockResolvedValue({ ...tokens, usuario }), refresh: vi.fn().mockResolvedValue(tokens),
    logout: vi.fn().mockResolvedValue(undefined), logoutAll: vi.fn().mockResolvedValue(undefined), me: vi.fn().mockResolvedValue(principal),
  };
  const store = createTokenStore();
  const session = createAuthSession(api, store);
  await session.login({ identificador: "ana", contrasena: "test" });
  api.me.mockClear();
  return { api, store, session };
}
afterEach(() => vi.useRealTimers());

describe("reloadPrincipal", () => {
  it("conserva snapshot y suscriptores si el payload no cambia", async () => {
    const { api, store, session } = await setup();
    const previous = session.getSnapshot();
    const listener = vi.fn();
    session.subscribe(listener);
    api.me.mockResolvedValue(structuredClone(principal));
    await session.reloadPrincipal();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toBe(previous);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getAccessToken()).toBe("token");
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("reemplaza usuario, roles y permisos cambiados y comparte una única petición", async () => {
    const { api, session } = await setup();
    const changed = { usuario: { ...usuario, nombre_completo: "Ana nueva" }, roles: ["editor"], permisos: ["identity.users.view"] };
    let resolve!: (value: typeof changed) => void;
    api.me.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const listener = vi.fn();
    session.subscribe(listener);
    const first = session.reloadPrincipal();
    const second = session.reloadPrincipal();
    expect(first).toBe(second);
    expect(api.me).toHaveBeenCalledTimes(1);
    resolve(changed);
    await Promise.all([first, second]);
    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: changed.usuario, roles: changed.roles, permissions: changed.permisos });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.hasPermission("identity.roles.view")).toBe(false);
    expect(session.hasPermission("identity.users.view")).toBe(true);
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it("un error de red conserva sesión, token y permisos sin publicar", async () => {
    const { api, store, session } = await setup();
    const previous = session.getSnapshot();
    const listener = vi.fn();
    session.subscribe(listener);
    api.me.mockRejectedValue(new ApiError(0, "Sin red", null));
    await session.reloadPrincipal();
    expect(session.getSnapshot()).toBe(previous);
    expect(store.getAccessToken()).toBe("token");
    expect(listener).not.toHaveBeenCalled();
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it.each([true, false])("un 401 usa refresh o termina anónimo, refresh válido=%s", async (valid) => {
    const { api, store, session } = await setup();
    api.me.mockRejectedValueOnce(new ApiError(401, "Expirado", null));
    if (!valid) api.refresh.mockRejectedValue(new ApiError(401, "Expirado", null));
    await session.reloadPrincipal();
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(api.me).toHaveBeenCalledTimes(valid ? 2 : 1);
    expect(session.getSnapshot().status).toBe(valid ? "authenticated" : "anonymous");
    expect(store.getAccessToken()).toBe(valid ? "token" : null);
  });

  it("una respuesta tardía no resucita una sesión cerrada", async () => {
    const { api, store, session } = await setup();
    let resolve!: (value: typeof principal) => void;
    api.me.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const flight = session.reloadPrincipal();
    await session.logout();
    resolve(principal);
    await flight;
    expect(session.getSnapshot()).toEqual({ status: "anonymous", user: null, roles: [], permissions: [] });
    expect(store.getAccessToken()).toBeNull();
  });

  it("una recarga tardía no restaura la sesión tras fallar el refresh HTTP", async () => {
    const { api, store, session } = await setup();
    let resolve!: (value: typeof principal) => void;
    api.me.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const flight = session.reloadPrincipal();
    api.refresh.mockRejectedValue(new ApiError(401, "Expirado", null));
    await expect(session.refresh()).rejects.toMatchObject({ status: 401 });
    resolve(principal);
    await flight;
    expect(session.getSnapshot()).toEqual({ status: "anonymous", user: null, roles: [], permissions: [] });
    expect(store.getAccessToken()).toBeNull();
  });

  it("no consulta me desde una sesión anónima", async () => {
    const { api, session } = await setup();
    await session.logout();
    await session.reloadPrincipal();
    expect(api.me).not.toHaveBeenCalled();
  });

  it("debounce de 403 recarga una vez, sin bucles aunque me devuelva 403", async () => {
    vi.useFakeTimers();
    const { api, session } = await setup();
    api.me.mockRejectedValue(new ApiError(403, "Prohibido", null));
    session.onForbidden();
    session.onForbidden();
    await vi.advanceTimersByTimeAsync(99);
    expect(api.me).not.toHaveBeenCalled();
    session.onForbidden();
    await vi.advanceTimersByTimeAsync(100);
    expect(api.me).toHaveBeenCalledTimes(1);
    session.onForbidden();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().status).toBe("authenticated");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.me).toHaveBeenCalledTimes(1);
  });
});
