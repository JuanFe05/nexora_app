import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./http-client";
import { ApiError } from "./api-error";

describe("getWithMeta", () => {
  it("returns the JSON body and response headers while preserving request options", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ id: 1 }], { headers: { "X-Total-Count": "72" } }));
    const signal = new AbortController().signal;
    const client = createHttpClient({ baseUrl: "/api", fetchImpl });
    const result = await client.getWithMeta<{ id: number }[]>("/users?q=a&limit=10&offset=0", { signal, headers: { "X-Test": "kept" } });
    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.headers.get("x-total-count")).toBe("72");
    expect(fetchImpl.mock.calls[0]).toMatchObject(["/api/users?q=a&limit=10&offset=0", { method: "GET", signal, credentials: "include" }]);
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("X-Test")).toBe("kept");
  });
  it("returns headers and undefined for 204", async () => {
    const response = new Response(null, { status: 204, headers: { "X-Total-Count": "0" } });
    const json = vi.spyOn(response, "json");
    const client = createHttpClient({ baseUrl: "/api", fetchImpl: vi.fn().mockResolvedValue(response) });
    const result = await client.getWithMeta<void>("/users");
    expect(result.data).toBeUndefined();
    expect(result.headers.get("X-Total-Count")).toBe("0");
    expect(json).not.toHaveBeenCalled();
  });
  it("preserves ApiError including retry metadata", async () => {
    const body = { detail: "No disponible" };
    const client = createHttpClient({ baseUrl: "/api", fetchImpl: vi.fn().mockResolvedValue(Response.json(body, { status: 503, headers: { "Retry-After": "10" } })) });
    await expect(client.getWithMeta("/users")).rejects.toBeInstanceOf(ApiError);
    const other = createHttpClient({ baseUrl: "/api", fetchImpl: vi.fn().mockResolvedValue(Response.json(body, { status: 503, headers: { "Retry-After": "10" } })) });
    await expect(other.getWithMeta("/users")).rejects.toMatchObject({ status: 503, body, detail: "No disponible", retryAfter: "10" });
  });
  it("refreshes and retries once, returning only the successful response metadata", async () => {
    let token = "expired";
    const refreshSession = vi.fn(async () => { token = "new"; });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json([], { headers: { "X-Total-Count": "8" } }));
    const client = createHttpClient({ baseUrl: "/api", fetchImpl, getAccessToken: () => token, refreshSession });
    const signal = new AbortController().signal;
    const result = await client.getWithMeta("users", { signal });
    expect(result.data).toEqual([]);
    expect(result.headers.get("X-Total-Count")).toBe("8");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer new");
    expect(fetchImpl.mock.calls[1][1]?.signal).toBe(signal);
  });
  it("does not retry a second 401 or refresh auth endpoints", async () => {
    for (const path of ["users", "auth/me"]) {
      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}, { status: 401 }));
      const client = createHttpClient({ baseUrl: "/api", fetchImpl, refreshSession });
      await expect(client.getWithMeta(path)).rejects.toMatchObject({ status: 401 });
      expect(fetchImpl).toHaveBeenCalledTimes(path === "users" ? 2 : 1);
      expect(refreshSession).toHaveBeenCalledTimes(path === "users" ? 1 : 0);
    }
  });
});
