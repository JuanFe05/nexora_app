import { pagedResult, type PagedQueryParams } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import type { User, UserCreate, UserPatch } from "../types";

export async function listUsers({ q, limit, offset, signal }: PagedQueryParams) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) params.set("q", q);
  return pagedResult(await httpClient.getWithMeta<User[]>(`/users?${params}`, { signal }));
}
export function createUser(body: UserCreate) {
  return httpClient.post<User>("/users", { body });
}
export function updateUser(id: string, body: UserPatch) {
  return httpClient.patch<User>(`/users/${encodeURIComponent(id)}`, { body });
}
export function deleteUser(id: string) {
  return httpClient.delete<void>(`/users/${encodeURIComponent(id)}`);
}
export function assignUserRole(id: string, roleId: string) {
  return httpClient.put<User>(`/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`);
}
export function revokeUserRole(id: string, roleId: string) {
  return httpClient.delete<void>(`/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`);
}
