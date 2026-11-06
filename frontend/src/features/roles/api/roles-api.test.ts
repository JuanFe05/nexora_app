import { afterEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { assignPermission, createRole, deleteRole, listRoles, revokePermission, roleErrorMessage, updateRole } from "./roles-api";
import { loadPermissionOptions } from "./permission-options";
import type { Role } from "../types";

const role: Role = { id: "r1", codigo: "VENTAS", nombre: "Ventas", descripcion: null, estado: "activo", permisos: [] };
afterEach(() => vi.restoreAllMocks());
describe("roles API", () => {
  it("uses paginated query parameters and total header, forwarding cancellation", async () => {
    const get = vi.spyOn(httpClient, "getWithMeta").mockResolvedValue({ data: [role], headers: new Headers({ "X-Total-Count": "61" }) });
    const signal = new AbortController().signal;
    expect(await listRoles({ q: "ventas & caja", limit: 10, offset: 20, signal })).toEqual({ items: [role], total: 61 });
    expect(get).toHaveBeenCalledWith("/roles?limit=10&offset=20&q=ventas+%26+caja", { signal });
    get.mockResolvedValue({ data: [], headers: new Headers() });
    expect(await listRoles({ q: "", limit: 50, offset: 0, signal })).toEqual({ items: [], total: 0 });
    expect(get).toHaveBeenLastCalledWith("/roles?limit=50&offset=0", { signal });
  });
  it("creates normalized roles and patches only changed mutable fields, never null or code", async () => {
    const post = vi.spyOn(httpClient, "post").mockResolvedValue(role);
    const patch = vi.spyOn(httpClient, "patch").mockResolvedValue(role);
    await createRole({ codigo: " VENTAS ", nombre: " Ventas ", descripcion: "  " });
    expect(post).toHaveBeenCalledWith("/roles", { body: { codigo: "VENTAS", nombre: "Ventas" } });
    await updateRole(role, { nombre: " Ventas ", descripcion: "", estado: "activo" });
    expect(patch).not.toHaveBeenCalled();
    await updateRole(role, { nombre: " Nueva ", descripcion: " Texto ", estado: "inactivo" });
    expect(patch).toHaveBeenCalledExactlyOnceWith("/roles/r1", { body: { nombre: "Nueva", descripcion: "Texto", estado: "inactivo" } });
  });
  it("uses role and permission ids for assignments, revocations and deletion", async () => {
    const put = vi.spyOn(httpClient, "put").mockResolvedValue(role);
    const remove = vi.spyOn(httpClient, "delete").mockResolvedValue(undefined);
    await assignPermission("r1", "p1");
    await revokePermission("r1", "p2");
    await deleteRole("r1");
    expect(put).toHaveBeenCalledWith("/roles/r1/permissions/p1");
    expect(remove.mock.calls).toEqual([["/roles/r1/permissions/p2"], ["/roles/r1"]]);
  });
  it("propagates real API failures without replacing the typed error", async () => {
    const error = new ApiError(409, "El código del rol ya existe", {});
    vi.spyOn(httpClient, "post").mockRejectedValue(error);
    await expect(createRole({ codigo: "VENTAS", nombre: "Ventas", descripcion: "" })).rejects.toBe(error);
  });
  it.each([
    [401, "Sesión expirada. Vuelve a iniciar sesión."],
    [403, "Este rol tiene usuarios asignados"],
    [404, "El rol o permiso ya no existe. Actualiza los datos."],
    [409, "Este rol tiene usuarios asignados"],
    [422, "Revisa los datos del formulario. No cumplen las reglas del servidor."],
    [0, "No se pudo conectar con el servidor. Intenta de nuevo."],
  ])("maps status %s safely in Spanish", (status, message) => {
    expect(roleErrorMessage(new ApiError(status, "Este rol tiene usuarios asignados", {}))).toBe(message);
  });
  it("does not expose unexpected internal errors", () => {
    expect(roleErrorMessage(new Error("internal stack"))).toBe("No se pudo completar la solicitud. Intenta de nuevo.");
  });
});
describe("permission options", () => {
  it("loads all catalog pages in batches of 100 using the header, not role codes as ids", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, codigo: `mod.p${i}`, nombre: `Permiso ${i}`, modulo: "mod", descripcion: null }));
    const last = { ...first[0], id: "p100", codigo: "mod.last" };
    const get = vi.spyOn(httpClient, "getWithMeta")
      .mockResolvedValueOnce({ data: first, headers: new Headers({ "X-Total-Count": "101" }) })
      .mockResolvedValueOnce({ data: [last], headers: new Headers({ "X-Total-Count": "101" }) });
    const signal = new AbortController().signal;
    expect(await loadPermissionOptions(signal)).toEqual([...first, last]);
    expect(get.mock.calls).toEqual([["/permissions?limit=100&offset=0", { signal }], ["/permissions?limit=100&offset=100", { signal }]]);
  });
  it("fails rather than silently accepting a truncated catalog", async () => {
    vi.spyOn(httpClient, "getWithMeta").mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "1" }) });
    await expect(loadPermissionOptions()).rejects.toThrow();
  });
});
