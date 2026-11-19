// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCatalog } from "./use-catalog";

afterEach(cleanup);

it("does not fetch while disabled and safely enables/disables", async () => {
  const fetcher = vi.fn(async () => [{ id: 1, nombre: "Synthetic" }]);
  const { result, rerender } = renderHook(
    ({ enabled }) => useCatalog(enabled ? fetcher : undefined, "Error"),
    { initialProps: { enabled: false } },
  );

  expect(fetcher).toHaveBeenCalledTimes(0);
  expect(result.current.loading).toBe(false);
  expect(result.current.items).toEqual([]);
  expect(result.current.error).toBeUndefined();

  act(() => result.current.retry());
  expect(fetcher).toHaveBeenCalledTimes(0);

  rerender({ enabled: true });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.current.items).toEqual([{ id: 1, nombre: "Synthetic" }]);

  rerender({ enabled: false });
  expect(result.current.items).toEqual([]);
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
