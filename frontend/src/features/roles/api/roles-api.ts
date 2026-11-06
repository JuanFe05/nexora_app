import { pagedResult, type PagedQueryParams } from "@/components/shared/data-table";
import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import type { Role, RoleMutableValues } from "../types";

export async function listRoles({ q, limit, offset, signal }: PagedQueryParams) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  return pagedResult(await httpClient.getWithMeta<Role[]>(`/roles?${params}`, { signal }));
}
export function createRole(values: { codigo: string; nombre: string; descripcion: string }) {
  const descripcion = values.descripcion.trim();
  return httpClient.post<Role>("/roles", { body: { codigo: values.codigo.trim(), nombre: values.nombre.trim(), ...(descripcion ? { descripcion } : {}) } });
}
/** PATCH forbids null and code changes. An unchanged form never makes a request. */
export function changedRoleFields(previous: Role, values: RoleMutableValues) {
  const body: Partial<RoleMutableValues> = {};
  if (values.nombre.trim() !== previous.nombre) body.nombre = values.nombre.trim();
  if (values.descripcion.trim() !== (previous.descripcion ?? "")) body.descripcion = values.descripcion.trim();
  if (values.estado !== previous.estado) body.estado = values.estado;
  return body;
}
export async function updateRole(previous: Role, values: RoleMutableValues): Promise<Role> {
  const body = changedRoleFields(previous, values);
  return Object.keys(body).length ? httpClient.patch<Role>(`/roles/${encodeURIComponent(previous.id)}`, { body }) : previous;
}
export function deleteRole(id: string) {
  return httpClient.delete<void>(`/roles/${encodeURIComponent(id)}`);
}
export function assignPermission(roleId: string, permissionId: string) {
  return httpClient.put<Role>(`/roles/${encodeURIComponent(roleId)}/permissions/${encodeURIComponent(permissionId)}`);
}
export function revokePermission(roleId: string, permissionId: string) {
  return httpClient.delete<void>(`/roles/${encodeURIComponent(roleId)}/permissions/${encodeURIComponent(permissionId)}`);
}
export function roleErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401: return "Sesión expirada. Vuelve a iniciar sesión.";
      case 403: return "No tienes autorización para administrar roles.";
      case 404: return "El rol o permiso ya no existe. Actualiza los datos.";
      case 409: return error.detail;
      case 422: return "Revisa los datos del formulario. No cumplen las reglas del servidor.";
      case 0: return "No se pudo conectar con el servidor. Intenta de nuevo.";
    }
  }
  return "No se pudo completar la solicitud. Intenta de nuevo.";
}
