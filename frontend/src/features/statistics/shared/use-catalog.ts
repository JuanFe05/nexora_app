import { useEffect, useState } from "react";
import type { CatalogOption } from "./types";

export function useCatalog(
  fetcher: (signal?: AbortSignal) => Promise<CatalogOption[]>,
  errorMessage: string,
) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    items: CatalogOption[];
    error?: string;
    revision: number;
  }>({ items: [], revision: -1 });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetcher(controller.signal)
      .then((items) => {
        if (active) setResult({ items, revision });
      })
      .catch(() => {
        if (active) setResult({ items: [], error: errorMessage, revision });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [fetcher, errorMessage, revision]);
  const loading = revision !== result.revision;
  return {
    items: result.items,
    loading,
    error: loading ? undefined : result.error,
    retry: () => setRevision((current) => current + 1),
  };
}
