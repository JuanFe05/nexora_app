import { pagedResult, type PagedQueryParams } from "@/components/shared/data-table";
import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import { normalizedValues, permissionChanges } from "../hooks/permission-form";
import type { Permission, PermissionCreate, PermissionValues } from "../types";

export async function listPermissions({ q, limit, offset, signal }: PagedQueryParams) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  return pagedResult(await httpClient.getWithMeta<Permission[]>(`/permissions?${params}`, { signal }));
}

export function createPermission(values: PermissionValues): Promise<Permission> {
  const { descripcion, ...required } = normalizedValues(values);
  const body: PermissionCreate = { ...required, ...(descripcion ? { descripcion } : {}) };
  return httpClient.post<Permission>("/permissions", { body });
}

export async function updatePermission(original: Permission, values: PermissionValues): Promise<Permission> {
  const body = permissionChanges(original, values);
  if (Object.keys(body).length === 0) return original;
  return httpClient.patch<Permission>(`/permissions/${encodeURIComponent(original.id)}`, { body });
}

export function deletePermission(id: string): Promise<void> {
  return httpClient.delete<void>(`/permissions/${encodeURIComponent(id)}`);
}

export function permissionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0: return "No se pudo conectar con el servidor.";
      case 401: return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
      case 403: return "No tienes autorización para administrar permisos.";
      case 404: return "El permiso ya no existe. Actualiza el listado.";
      case 409: return error.detail;
      case 422: return "Revisa los datos del permiso e inténtalo de nuevo.";
    }
  }
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}
