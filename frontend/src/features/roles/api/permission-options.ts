import { pagedResult } from "@/components/shared/data-table";
import { httpClient } from "@/lib/http/http-client";
import type { PermissionOption } from "../types";

/** Independent catalog lookup: roles list permission codes, assignment routes need ids. */
export async function loadPermissionOptions(signal?: AbortSignal): Promise<PermissionOption[]> {
  const items: PermissionOption[] = [];
  let total: number;
  do {
    const page = pagedResult(await httpClient.getWithMeta<PermissionOption[]>(`/permissions?limit=100&offset=${items.length}`, { signal }));
    total = page.total;
    if (!page.items.length && items.length < total) throw new Error("El catálogo de permisos está incompleto.");
    items.push(...page.items);
  } while (items.length < total);
  return items;
}
