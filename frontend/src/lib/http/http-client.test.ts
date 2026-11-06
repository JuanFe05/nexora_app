import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env";
import { ApiError } from "./api-error";
import { createHttpClient, httpClient } from "./http-client";

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
