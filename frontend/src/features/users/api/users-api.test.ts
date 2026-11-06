import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { assignUserRole, createUser, deleteUser, listUsers, revokeUserRole, updateUser } from "./users-api";
import { loadRoleOptions } from "./role-options";
import { userError } from "./user-error";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { getWithMeta: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
describe("users API", () => {
  it("passes search, pagination and signal and parses the matching total", async () => {
    vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [{ id: "u" }], headers: new Headers({ "X-Total-Count": "123" }) });
    const signal = new AbortController().signal;
    expect(await listUsers({ q: "Ana & Sol", limit: 25, offset: 50, signal })).toEqual({ items: [{ id: "u" }], total: 123 });
    expect(httpClient.getWithMeta).toHaveBeenCalledWith("/users?limit=25&offset=50&q=Ana+%26+Sol", { signal });
  });
  it("omits empty q and uses the shared invalid-header fallback", async () => {
    vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [{ id: "u" }], headers: new Headers({ "X-Total-Count": "bad" }) });
    expect((await listUsers({ q: "", limit: 10, offset: 0, signal: new AbortController().signal })).total).toBe(1);
    expect(vi.mocked(httpClient.getWithMeta).mock.calls[0][0]).toBe("/users?limit=10&offset=0");
  });
  it("keeps creation, minimal patch, deletion and role routes separate", async () => {
    const body = { nombre_usuario: "ana", correo: "ana@example.org", primer_nombre: "Ana", primer_apellido: "Sol", contrasena: "123456789012" };
    await createUser(body);
    await updateUser("u", { primer_nombre: "Ana María" });
    await deleteUser("u");
    await assignUserRole("u", "r");
    await revokeUserRole("u", "r");
    expect(httpClient.post).toHaveBeenCalledWith("/users", { body });
    expect(httpClient.patch).toHaveBeenCalledWith("/users/u", { body: { primer_nombre: "Ana María" } });
    expect(httpClient.delete).toHaveBeenCalledWith("/users/u");
    expect(httpClient.put).toHaveBeenCalledWith("/users/u/roles/r");
    expect(httpClient.delete).toHaveBeenCalledWith("/users/u/roles/r");
  });
  it("loads all role catalog pages of 100", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: String(i), codigo: `R${i}`, nombre: `Rol ${i}` }));
    vi.mocked(httpClient.getWithMeta).mockResolvedValueOnce({ data: first, headers: new Headers({ "X-Total-Count": "101" }) }).mockResolvedValueOnce({ data: [{ id: "100", codigo: "ULTIMO", nombre: "Último" }], headers: new Headers({ "X-Total-Count": "101" }) });
    const signal = new AbortController().signal;
    expect(await loadRoleOptions(signal)).toHaveLength(101);
    expect(httpClient.getWithMeta).toHaveBeenNthCalledWith(1, "/roles?limit=100&offset=0", { signal });
    expect(httpClient.getWithMeta).toHaveBeenNthCalledWith(2, "/roles?limit=100&offset=100", { signal });
  });
  it("fails a truncated role catalog instead of silently omitting assignments", async () => {
    vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "2" }) });
    await expect(loadRoleOptions()).rejects.toThrow("No se pudo cargar el catálogo completo de roles.");
  });
  it.each([403, 404, 409])("preserves Spanish domain detail for %s", status => {
    expect(userError(new ApiError(status, "Mensaje del backend", null)).message).toBe("Mensaje del backend");
  });
  it.each([401, 0, 500])("maps %s to a safe Spanish error", status => {
    const error = userError(new ApiError(status, "internal", null));
    expect(error.message).not.toContain("internal");
    expect(error.message.length).toBeGreaterThan(10);
  });
  it("maps 422 locations without echoing password input or raw messages", () => {
    const result = userError(new ApiError(422, "secret-password", { detail: [{ loc: ["body", "correo"], msg: "bad" }, { loc: ["body", "contrasena"], msg: "secret-password", input: "secret-password" }] }));
    expect(result.fields.correo).toBe("Revisa este campo.");
    expect(result.fields.contrasena).toBe("Revisa la contraseña (entre 12 y 128 caracteres).");
    expect(JSON.stringify(result)).not.toContain("secret-password");
    expect(userError(new ApiError(422, "raw", { detail: [{ loc: ["query", "unknown"] }] })).message).toBe("Revisa los datos e inténtalo de nuevo.");
  });
});
