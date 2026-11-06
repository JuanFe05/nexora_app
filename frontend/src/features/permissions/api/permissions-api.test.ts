import { afterEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { createPermission, deletePermission, listPermissions, permissionErrorMessage, updatePermission } from "./permissions-api";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { getWithMeta: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
afterEach(() => vi.clearAllMocks());
const permission = { id: "p1", codigo: "identity.users.view", nombre: "Ver usuarios", modulo: "identity", descripcion: "Consultar usuarios" };

describe("permissions API", () => {
  it("requests the real paginated endpoint with encoded search and uses total headers", async () => {
    vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [permission], headers: new Headers({ "X-Total-Count": "61" }) });
    const signal = new AbortController().signal;
    expect(await listPermissions({ q: "usuarios & roles", limit: 10, offset: 20, signal })).toEqual({ items: [permission], total: 61 });
    const [url, options] = vi.mocked(httpClient.getWithMeta).mock.calls[0];
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/permissions");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ q: "usuarios & roles", limit: "10", offset: "20" });
    expect(options).toEqual({ signal });
  });
  it("omits empty search and falls back when total is missing", async () => {
    vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [permission], headers: new Headers() });
    expect((await listPermissions({ q: "", limit: 25, offset: 0, signal: new AbortController().signal })).total).toBe(1);
    expect(vi.mocked(httpClient.getWithMeta).mock.calls[0][0]).toBe("/permissions?limit=25&offset=0");
  });
  it("creates with trimmed values and omits the optional empty description", async () => {
    vi.mocked(httpClient.post).mockResolvedValue(permission);
    await createPermission({ codigo: " identity.users.view ", nombre: " Ver usuarios ", modulo: " identity ", descripcion: " " });
    expect(httpClient.post).toHaveBeenCalledExactlyOnceWith("/permissions", { body: { codigo: permission.codigo, nombre: permission.nombre, modulo: permission.modulo } });
  });
  it("patches changed fields only, never code or null, and skips unchanged edits", async () => {
    const values = { ...permission, nombre: " Consultar usuarios " };
    await updatePermission(permission, values);
    expect(httpClient.patch).toHaveBeenCalledExactlyOnceWith("/permissions/p1", { body: { nombre: "Consultar usuarios" } });
    vi.mocked(httpClient.patch).mockClear();
    expect(await updatePermission(permission, { ...permission, nombre: ` ${permission.nombre} ` })).toEqual(permission);
    expect(httpClient.patch).not.toHaveBeenCalled();
    await updatePermission({ ...permission, descripcion: null }, { ...permission, descripcion: "" });
    expect(httpClient.patch).not.toHaveBeenCalled();
  });
  it("deletes through the real endpoint and preserves API errors", async () => {
    const error = new ApiError(409, "El permiso pertenece al catálogo del sistema", null);
    vi.mocked(httpClient.delete).mockRejectedValue(error);
    await expect(deletePermission(permission.id)).rejects.toBe(error);
    expect(httpClient.delete).toHaveBeenCalledWith("/permissions/p1");
  });
  it.each([
    [401, "Tu sesión ha caducado. Vuelve a iniciar sesión."],
    [403, "No tienes autorización para administrar permisos."],
    [404, "El permiso ya no existe. Actualiza el listado."],
    [409, "Este permiso está asignado a roles."],
    [422, "Revisa los datos del permiso e inténtalo de nuevo."],
    [0, "No se pudo conectar con el servidor."],
    [500, "No se pudo completar la operación. Inténtalo de nuevo."],
  ])("maps status %s safely", (status, message) => {
    expect(permissionErrorMessage(new ApiError(status, "Este permiso está asignado a roles.", null))).toBe(message);
  });
  it("does not leak unexpected errors", () => expect(permissionErrorMessage(new Error("internal stack"))).toBe("No se pudo completar la operación. Inténtalo de nuevo."));
});
