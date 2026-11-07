import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env";
import { ApiError } from "./api-error";
import { createHttpClient, httpClient } from "./http-client";
import { createAuthApi } from "../../features/auth/api/auth-api";
import { createTokenStore } from "../../features/auth/session/token-store";
import { createAuthSession } from "../../features/auth/session/auth-session";
import { authErrorMessage } from "../../features/auth/error-message";

const usuario = { id: "user-1", nombre_usuario: "prueba", correo: "prueba@example.test", nombre_completo: "Persona de prueba" };
const principal = { usuario, roles: ["operador"], permisos: ["example.view"] };
const tokens = { access_token: "test-access", token_type: "bearer", expires_in: 600 };

function sessionSetup() {
  const api = {
    login: vi.fn().mockResolvedValue({ ...tokens, usuario }),
    refresh: vi.fn().mockResolvedValue(tokens),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue(principal),
  };
  const store = createTokenStore();
  return { api, store, session: createAuthSession(api, store) };
}

describe("auth API", () => {
  it("logoutAll sends bearer, current CSRF cookie, credentials and no body; accepts 204", async () => {
    vi.stubGlobal("document", { cookie: "nexora_csrf_token=csrf-value" });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    try {
      const api = createAuthApi(createHttpClient({ baseUrl: "/api/v1", fetchImpl, getAccessToken: () => "test-access" }));
      expect(await api.logoutAll()).toBeUndefined();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe("/api/v1/auth/logout-all");
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
      expect(init?.body).toBeUndefined();
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-access");
      expect(headers.get("X-CSRF-Token")).toBe("csrf-value"); expect(headers.has("Origin")).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it("sends the exact login body and gets the principal with bearer", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...tokens, usuario }))
      .mockResolvedValueOnce(Response.json(principal));
    const client = createHttpClient({ baseUrl: "/api/v1", fetchImpl, getAccessToken: () => "test-access" });
    const api = createAuthApi(client);
    expect(await api.login({ identificador: "prueba", contrasena: "synthetic-test-value" })).toEqual({ ...tokens, usuario });
    expect(await api.me()).toEqual(principal);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/v1/auth/login");
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(JSON.stringify({ identificador: "prueba", contrasena: "synthetic-test-value" }));
    expect(fetchImpl.mock.calls[1][0]).toBe("/api/v1/auth/me");
    expect(fetchImpl.mock.calls[1][1]?.method).toBe("GET");
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer test-access");
  });

  it.each(["refresh", "logout"] as const)("%s reads the current CSRF cookie without sending a body or Origin", async (method) => {
    vi.stubGlobal("document", { cookie: "other=value; nexora_csrf_token=first%3Dtoken" });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => method === "logout" ? new Response(null, { status: 204 }) : Response.json(tokens));
    try {
      const api = createAuthApi(createHttpClient({ baseUrl: "/api/v1", fetchImpl }));
      await api[method]();
      document.cookie = "nexora_csrf_token=rotated";
      await api[method]();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      for (const [index, call] of fetchImpl.mock.calls.entries()) {
        expect(call[0]).toBe(`/api/v1/auth/${method}`);
        expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
        expect(call[1]?.body).toBeUndefined();
        const headers = new Headers(call[1]?.headers);
        expect(headers.get("X-CSRF-Token")).toBe(index === 0 ? "first=token" : "rotated");
        expect(headers.has("Origin")).toBe(false);
      }
    } finally { vi.unstubAllGlobals(); }
  });

  it("propagates errors and Retry-After even without a CSRF cookie", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "limit" }, { status: 429, headers: { "Retry-After": "37" } }));
    const api = createAuthApi(createHttpClient({ baseUrl: "/api/v1", fetchImpl }));
    await expect(api.refresh()).rejects.toMatchObject({ status: 429, retryAfter: "37" });
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).has("X-CSRF-Token")).toBe(false);
  });
});

describe("memory session", () => {
  it("stores and clears access tokens independently in memory", () => {
    const store = createTokenStore();
    expect(store.getAccessToken()).toBeNull();
    store.setAccessToken("test-access");
    expect(store.getAccessToken()).toBe("test-access");
    expect(createTokenStore().getAccessToken()).toBeNull();
    store.clear();
    expect(store.getAccessToken()).toBeNull();
  });

  it("restores once and shares concurrent refreshes, including me and permissions", async () => {
    const { api, store, session } = sessionSetup();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    expect(session.getSnapshot().status).toBe("loading");
    await Promise.all([session.restore(), session.restore(), session.refresh()]);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(store.getAccessToken()).toBe("test-access");
    expect(session.getSnapshot()).toEqual({ status: "authenticated", user: usuario, roles: principal.roles, permissions: principal.permisos });
    expect(session.hasPermission("example.view")).toBe(true);
    expect(session.hasPermission("example.edit")).toBe(false);
    expect(listener).toHaveBeenCalled();
    await session.restore();
    expect(api.refresh).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("login loads me and logout clears everything even on network failure", async () => {
    const { api, store, session } = sessionSetup();
    const input = { identificador: "prueba", contrasena: "synthetic-test-value" };
    await session.login(input);
    expect(api.login).toHaveBeenCalledWith(input);
    expect(session.getSnapshot().user).toEqual(usuario);
    api.logout.mockRejectedValue(new Error("network"));
    await session.logout();
    expect(store.getAccessToken()).toBeNull();
    expect(session.getSnapshot()).toEqual({ status: "anonymous", user: null, roles: [], permissions: [] });
    expect(session.hasPermission("example.view")).toBe(false);
  });

  it("a rejected login leaves no token, user or permissions and preserves the error", async () => {
    const { api, store, session } = sessionSetup();
    const error = new ApiError(401, "Credenciales invalidas", null);
    api.login.mockRejectedValue(error);
    await expect(session.login({ identificador: "prueba", contrasena: "synthetic-test-value" })).rejects.toBe(error);
    expect(api.me).not.toHaveBeenCalled();
    expect(store.getAccessToken()).toBeNull();
    expect(session.getSnapshot()).toEqual({ status: "anonymous", user: null, roles: [], permissions: [] });
  });

  it("does not resurrect a session when logout overlaps refresh", async () => {
    const { api, store, session } = sessionSetup();
    let resolve!: (value: typeof tokens) => void;
    api.refresh.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const refresh = session.refresh();
    const outcome = refresh.catch(() => undefined);
    const logout = session.logout();
    expect(session.getSnapshot().status).toBe("anonymous");
    resolve(tokens);
    await Promise.all([outcome, logout]);
    expect(store.getAccessToken()).toBeNull();
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it.each(["refresh", "me"] as const)("failed %s clears tokens and principal", async (method) => {
    const { api, store, session } = sessionSetup();
    await session.login({ identificador: "prueba", contrasena: "synthetic-test-value" });
    api[method].mockRejectedValue(new ApiError(401, "No autenticado", null));
    await expect(session.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(store.getAccessToken()).toBeNull();
    expect(session.getSnapshot()).toEqual({ status: "anonymous", user: null, roles: [], permissions: [] });
  });
});

describe("forbidden notifications", () => {
  it.each(["get", "getWithMeta", "post", "put", "patch", "delete"] as const)("%s notifica 403 sin reintentar ni alterar el error", async (method) => {
    const onForbidden = vi.fn();
    const refreshSession = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "Sin permiso" }, { status: 403 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl });
    client.configureAuth({ onForbidden, refreshSession });
    await expect(client[method]("/roles")).rejects.toMatchObject({ status: 403, detail: "Sin permiso" });
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each(["/auth/login", "auth/refresh", "/auth/logout", "/auth/me?check=1"])("no notifica 403 en %s para evitar bucles", async (path) => {
    const onForbidden = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 403 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, onForbidden });
    await expect(client.get(path)).rejects.toMatchObject({ status: 403 });
    expect(onForbidden).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("notifica incluso un 403 no JSON y aísla fallos del callback", async () => {
    const onForbidden = vi.fn(() => { throw new Error("callback"); });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("Forbidden", { status: 403 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, onForbidden });
    await expect(client.get("/roles")).rejects.toMatchObject({ status: 403, body: null });
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });
  it("sin hook un 403 sigue siendo el mismo ApiError", async () => {
    const client = createHttpClient({ baseUrl: "/api", fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "Sin permiso" }, { status: 403 })) });
    await expect(client.get("/roles")).rejects.toMatchObject({ status: 403, detail: "Sin permiso" });
  });
});

describe("authenticated HTTP recovery", () => {
  it("propagates transient refresh errors without replacing them with 401 or retrying the request", async () => {
    const error = new ApiError(0, "Renovación temporalmente no disponible", null);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, refreshSession: vi.fn().mockRejectedValue(error) });
    await expect(client.get("resource")).rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("only ordinary API requests count as activity, not auth calls or the 401 retry", async () => {
    const onActivity = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockImplementation(async () => Response.json({}));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, onActivity, refreshSession: vi.fn().mockResolvedValue(undefined) });
    await client.get("resource");
    await client.post("/auth/refresh"); await client.get("/auth/me");
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it("configures the shared-client hooks without changing ordinary GET behavior", async () => {
    const store = createTokenStore();
    store.setAccessToken("first");
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl });
    const refreshSession = vi.fn();
    client.configureAuth({ getAccessToken: store.getAccessToken, refreshSession });
    expect(await client.get("resource")).toEqual({ ok: true });
    store.clear();
    expect(await client.get("resource")).toEqual({ ok: true });
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer first");
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).has("Authorization")).toBe(false);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("simultaneous 401s share one session refresh and retry with the renewed bearer", async () => {
    const { api, store, session } = sessionSetup();
    await session.login({ identificador: "prueba", contrasena: "synthetic-test-value" });
    store.setAccessToken("expired");
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
      new Headers(init?.headers).get("Authorization") === "Bearer expired"
        ? Response.json({}, { status: 401 })
        : Response.json({ ok: true }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: store.getAccessToken, refreshSession: session.refresh });
    expect(await Promise.all([client.get("first"), client.get("second")])).toEqual([{ ok: true }, { ok: true }]);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(session.getSnapshot().status).toBe("authenticated");
  });

  it("refreshes on 401 and retries once with the current token and original body/options", async () => {
    let token = "expired";
    const refreshSession = vi.fn(async () => { token = "renewed"; });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json({ saved: true }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: () => token, refreshSession });
    const signal = new AbortController().signal;
    expect(await client.post("resource", { body: { value: 1 }, headers: { "X-Test": "kept" }, signal })).toEqual({ saved: true });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer expired");
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer renewed");
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("X-Test")).toBe("kept");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: "POST", body: '{"value":1}', signal, credentials: "include" });
  });

  it.each(["/auth/login", "auth/refresh", "/auth/logout", "/auth/me?check=1"])("does not refresh auth endpoint %s", async (path) => {
    const refreshSession = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, refreshSession });
    await expect(client.post(path)).rejects.toMatchObject({ status: 401 });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never refreshes or retries a second time", async () => {
    const refreshSession = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}, { status: 401 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, refreshSession });
    await expect(client.get("resource")).rejects.toMatchObject({ status: 401 });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a failed refresh makes the real session anonymous without retrying", async () => {
    const { api, store, session } = sessionSetup();
    await session.login({ identificador: "prueba", contrasena: "synthetic-test-value" });
    api.refresh.mockRejectedValue(new ApiError(401, "No autenticado", null));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: store.getAccessToken, refreshSession: session.refresh });
    await expect(client.get("resource")).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(store.getAccessToken()).toBeNull();
    expect(session.getSnapshot().status).toBe("anonymous");
  });
});

describe("Spanish authentication errors", () => {
  it.each([
    [new ApiError(401, "sensitive field detail", null), "Credenciales invalidas"],
    [new ApiError(429, "limit", null, "37"), "Demasiados intentos. Intenta de nuevo en 37 segundos."],
    [new ApiError(429, "limit", null), "Demasiados intentos. Intenta de nuevo más tarde."],
    [new ApiError(429, "limit", null, "invalid"), "Demasiados intentos. Intenta de nuevo más tarde."],
    [new ApiError(422, "private validation", null), "Revisa el usuario o correo y la contraseña."],
    [new ApiError(0, "private network", null), "No se pudo conectar con el servidor. Intenta de nuevo."],
    [new Error("private error"), "No se pudo iniciar sesión. Intenta de nuevo."],
  ])("maps safely to %s", (error, message) => {
    expect(authErrorMessage(error)).toBe(message);
  });
});

function setup(response: Response, token?: string) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
  return {
    fetchImpl,
    client: createHttpClient({ baseUrl: "/api/v1", fetchImpl, getAccessToken: () => token }),
  };
}

describe("HTTP client", () => {
  it.each([undefined, "access-token"])("GET sends cookies and optional bearer (%s)", async (token) => {
    const { client, fetchImpl } = setup(Response.json({ id: 1 }), token);
    expect(await client.get<{ id: number }>("/users")).toEqual({ id: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/v1/users");
    expect(options?.method).toBe("GET");
    expect(options?.credentials).toBe("include");
    expect(options?.body).toBeUndefined();
    expect(new Headers(options?.headers).get("Authorization")).toBe(token ? `Bearer ${token}` : null);
    expect(new Headers(options?.headers).get("Accept")).toBe("application/json");
  });

  it.each(["post", "put", "patch", "delete"] as const)("%s sends JSON and preserves options", async (method) => {
    const { client, fetchImpl } = setup(Response.json({ saved: true }), "token");
    const controller = new AbortController();
    expect(await client[method]<{ saved: boolean }>("users", {
      body: { name: "Ana" }, headers: { "X-Request-ID": "request-1" }, signal: controller.signal,
    })).toEqual({ saved: true });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/v1/users");
    expect(options).toMatchObject({ method: method.toUpperCase(), credentials: "include", body: '{"name":"Ana"}', signal: controller.signal });
    const headers = new Headers(options?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Request-ID")).toBe("request-1");
  });

  it("reads the current token on every request", async () => {
    let token: string | undefined = "first";
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: () => token });
    await client.get("users");
    token = undefined;
    await client.get("users");
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer first");
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).has("Authorization")).toBe(false);
  });

  it("handles 204 without parsing JSON", async () => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, "json");
    const { client, fetchImpl } = setup(response);
    expect(await client.delete<void>("/users/1")).toBeUndefined();
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "DELETE", credentials: "include" });
    expect(fetchImpl.mock.calls[0][1]?.body).toBeUndefined();
  });

  it.each([
    [401, { detail: "No autenticado" }, "No autenticado"],
    [422, { detail: [{ loc: ["body", "email"], msg: "Correo inválido", type: "value_error" }, { loc: ["body", "name"], msg: "Campo obligatorio" }] }, "body.email: Correo inválido; body.name: Campo obligatorio"],
    [500, { unexpected: true }, "No se pudo completar la solicitud."],
  ] as const)("exposes FastAPI error %s", async (status, body, detail) => {
    const { client } = setup(Response.json(body, { status }));
    const error = await client.get("/users").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, detail, body, message: detail });
  });

  it.each([200, 502])("uses a generic error for non-JSON responses (%s)", async (status) => {
    const { client } = setup(new Response("<html>private upstream text</html>", { status }));
    const error = await client.get("/users").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, detail: "No se pudo completar la solicitud.", body: null, message: "No se pudo completar la solicitud." });
  });

  it("wraps network failures without exposing internal messages", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("private network info"));
    const client = createHttpClient({ baseUrl: "/api/v1", fetchImpl });
    const error = await client.get("/users").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, detail: "No se pudo conectar con el servidor.", body: null, message: "No se pudo conectar con el servidor." });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/api/v1", "users", "/api/v1/users"],
    ["/api/v1/", "/users", "/api/v1/users"],
    ["https://example.test/api/v1/", "/users?active=true", "https://example.test/api/v1/users?active=true"],
    ["/", "/users", "/users"],
    ["/api/v1/", "", "/api/v1/"],
  ])("joins %s and %s", async (baseUrl, path, expected) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    await createHttpClient({ baseUrl, fetchImpl }).get(path);
    expect(fetchImpl.mock.calls[0][0]).toBe(expected);
  });

  it("exports the shared instance configured from env", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await httpClient.get("/health");
      expect(fetchImpl.mock.calls[0][0]).toBe(`${env.apiBaseUrl.replace(/\/+$/, "")}/health`);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
