import { useEffect, useState } from "react";
import { loadRoleOptions } from "../api/role-options";
import { userError } from "../api/user-error";
import type { RoleOption } from "../types";

export function useRoleOptions(enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ items: RoleOption[]; error: string | null; revision: number }>({ items: [], error: null, revision: -1 });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    void loadRoleOptions(controller.signal).then(items => {
      if (active) setResult({ items, error: null, revision });
    }).catch((error: unknown) => {
      if (active) setResult({ items: [], error: userError(error).message, revision });
    });
    return () => { active = false; controller.abort(); };
  }, [enabled, revision]);
  const loading = enabled && result.revision !== revision;
  return { items: result.items, error: loading ? null : result.error, loading, ready: !enabled || (!loading && !result.error), retry: () => setRevision(value => value + 1) };
}
