// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { downloadBlob } from "./table-export";

afterEach(() => vi.restoreAllMocks());

it("downloads a blob through a temporary link and releases the object URL", () => {
  vi.useFakeTimers();
  const create = vi.fn().mockReturnValue("blob:x");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  downloadBlob(new Blob(["a"]), "informe.csv");

  expect(click).toHaveBeenCalledTimes(1);
  expect(document.querySelector("a[download]")).toBeNull();
  vi.advanceTimersByTime(1000);
  expect(revoke).toHaveBeenCalledWith("blob:x");
  vi.useRealTimers();
});
