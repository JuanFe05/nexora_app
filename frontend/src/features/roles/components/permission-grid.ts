import type { PermissionOption } from "../types";

/** Catalog modules sorted for presentation; permission order and data stay intact. */
export function groupPermissionOptions(options: PermissionOption[]) {
  const groups = new Map<string, PermissionOption[]>();
  for (const option of options) {
    const group = groups.get(option.modulo);
    if (group) group.push(option);
    else groups.set(option.modulo, [option]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, "es"));
}
