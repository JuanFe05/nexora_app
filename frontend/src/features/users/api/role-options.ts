import { pagedResult } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import type { RoleOption } from "../types";

/** Local catalog adapter: does not depend on the independently implemented Roles feature. */
export async function loadRoleOptions(signal?: AbortSignal): Promise<RoleOption[]> {
  const roles: RoleOption[] = [];
  let total: number;
  do {
    const page = pagedResult(await httpClient.getWithMeta<RoleOption[]>(`/roles?limit=100&offset=${roles.length}`, { signal }));
    total = page.total;
    if (!page.items.length && roles.length < total) {
      throw new Error("No se pudo cargar el catálogo completo de roles.");
    }
    roles.push(...page.items);
  } while (roles.length < total);
  return roles;
}
