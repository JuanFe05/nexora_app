// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pagedResult, usePagedQuery, type PagedQueryParams } from "./use-paged-query";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const result = { items: ["uno"], total: 45 };
describe("usePagedQuery", () => {
  it("loads immediately, debounces search 300ms and resets page for search and size", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(result);
    const { result: hook } = renderHook(() => usePagedQuery({ fetcher, initialPageSize: 10 }));
    await act(async () => {});
    expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ q: "", limit: 10, offset: 0, signal: expect.any(AbortSignal) }));
    act(() => hook.current.setPage(3));
    await act(async () => {});
    expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }));
    act(() => hook.current.setSearch("a"));
    expect(hook.current.page).toBe(1);
    act(() => { vi.advanceTimersByTime(200); hook.current.setSearch("ana"); });
    const calls = fetcher.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ana", offset: 0 }));
    act(() => hook.current.setPage(2));
    await act(async () => {});
    act(() => hook.current.setPageSize(25));
    await act(async () => {});
    expect(hook.current.page).toBe(1);
    expect(hook.current.pageSize).toBe(25);
    expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ana", limit: 25, offset: 0 }));
    expect(hook.current.items).toEqual(result.items);
    expect(hook.current.total).toBe(45);
    expect(hook.current.loading).toBe(false);
  });
  it("aborts old requests, ignores late success/error, and aborts on unmount", async () => {
    const pending: { resolve: (value: typeof result) => void; reject: (error: Error) => void; signal: AbortSignal }[] = [];
    const fetcher = vi.fn(({ signal }: PagedQueryParams) => new Promise<typeof result>((resolve, reject) => pending.push({ resolve, reject, signal })));
    const { result: hook, unmount } = renderHook(() => usePagedQuery({ fetcher }));
    expect(hook.current.loading).toBe(true);
    act(() => hook.current.reload());
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => pending[1].resolve({ items: ["nuevo"], total: 1 }));
    await act(async () => pending[0].resolve({ items: ["viejo"], total: 1 }));
    expect(hook.current.items).toEqual(["nuevo"]);
    act(() => hook.current.reload());
    act(() => hook.current.reload());
    await act(async () => pending[2].reject(new Error("obsoleto")));
    expect(hook.current.error).toBeNull();
    expect(hook.current.loading).toBe(true);
    unmount();
    expect(pending[3].signal.aborted).toBe(true);
  });
  it("reloads and clamps to the last available page after shrink, including zero total", async () => {
    let total = 21;
    const fetcher = vi.fn(async () => ({ items: ["fila"], total }));
    const { result: hook } = renderHook(() => usePagedQuery({ fetcher, initialPageSize: 10 }));
    await waitFor(() => expect(hook.current.loading).toBe(false));
    act(() => hook.current.setPage(3));
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 })));
    await waitFor(() => expect(hook.current.loading).toBe(false));
    total = 20;
    act(() => hook.current.reload());
    await waitFor(() => expect(hook.current.page).toBe(2));
    await waitFor(() => expect(hook.current.loading).toBe(false));
    expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }));
    total = 0;
    act(() => hook.current.reload());
    await waitFor(() => expect(hook.current.page).toBe(1));
    await waitFor(() => expect(hook.current.loading).toBe(false));
    expect(hook.current.total).toBe(0);
  });
  it("exposes errors and reload clears them on success", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("No disponible")).mockResolvedValue(result);
    const { result: hook } = renderHook(() => usePagedQuery({ fetcher }));
    await waitFor(() => expect(hook.current.error?.message).toBe("No disponible"));
    expect(hook.current.loading).toBe(false);
    act(() => hook.current.reload());
    await waitFor(() => expect(hook.current.items).toEqual(result.items));
    expect(hook.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
describe("pagedResult", () => {
  it.each([["42", 42], ["0", 0], [null, 2], ["", 2], ["invalid", 2], ["-1", 2], ["1.5", 2], ["Infinity", 2], ["2x", 2]])("parses header %s with safe fallback", (header, expected) => {
    const headers = new Headers();
    if (header !== null) headers.set("X-Total-Count", header);
    expect(pagedResult({ data: [1, 2], headers })).toEqual({ items: [1, 2], total: expected });
  });
});
