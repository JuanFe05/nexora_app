import { useCallback, useEffect, useState } from "react";
import type { HttpResult } from "@/lib/http/http-client";

export type PagedQueryParams = { q: string; limit: number; offset: number; signal: AbortSignal };
export type PagedResult<T> = { items: T[]; total: number };
export type PagedFetcher<T> = (params: PagedQueryParams) => Promise<PagedResult<T>>;

/** El cuerpo sigue siendo un array; el total no depende del tamaño de la página. */
export function pagedResult<T>({ data, headers }: HttpResult<T[]>): PagedResult<T> {
  const header = headers.get("X-Total-Count")?.trim() ?? "";
  const total = /^\d+$/.test(header) ? Number(header) : NaN;
  return { items: data, total: Number.isSafeInteger(total) && total >= 0 ? total : data.length };
}

function validSize(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.floor(value))) : 50;
}

export function usePagedQuery<T>({ fetcher, initialPageSize = 50 }: { fetcher: PagedFetcher<T>; initialPageSize?: number }) {
  const [query, setQuery] = useState({ page: 1, pageSize: validSize(initialPageSize), search: "", q: "", revision: 0 });
  const [result, setResult] = useState<PagedResult<T> & { query: typeof query | null; fetcher: PagedFetcher<T> | null; error: Error | null }>({ items: [], total: 0, query: null, fetcher: null, error: null });

  useEffect(() => {
    if (query.search === query.q) return;
    const timer = setTimeout(() => setQuery(current => ({ ...current, q: current.search, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [query.search, query.q]);

  useEffect(() => {
    if (query.search !== query.q) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const data = await fetcher({ q: query.q, limit: query.pageSize, offset: (query.page - 1) * query.pageSize, signal: controller.signal });
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(data.total / query.pageSize));
        if (query.page > lastPage) {
          setQuery(current => current === query ? { ...current, page: lastPage } : current);
          return;
        }
        setResult({ ...data, query, fetcher, error: null });
      } catch (error: unknown) {
        if (!active) return;
        setResult(current => ({ ...current, query, fetcher, error: error instanceof Error ? error : new Error("No se pudieron cargar los registros.") }));
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [query, fetcher]);

  const setPage = useCallback((page: number) => {
    if (!Number.isFinite(page)) return;
    const next = Math.max(1, Math.floor(page));
    setQuery(current => current.page === next ? current : { ...current, page: next });
  }, []);
  const setPageSize = useCallback((size: number) => {
    const next = validSize(size);
    setQuery(current => current.pageSize === next ? current : { ...current, pageSize: next, page: 1 });
  }, []);
  const setSearch = useCallback((search: string) => {
    setQuery(current => current.search === search ? current : { ...current, search, page: 1 });
  }, []);
  const reload = useCallback(() => setQuery(current => ({ ...current, revision: current.revision + 1 })), []);
  const loading = result.query !== query || result.fetcher !== fetcher;

  return { items: result.items, total: result.total, page: query.page, pageSize: query.pageSize, search: query.search, loading, error: loading ? null : result.error, setPage, setPageSize, setSearch, reload };
}
