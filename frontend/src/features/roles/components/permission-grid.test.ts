import { describe, expect, it } from "vitest";
import { permissionGridLayout } from "./permission-grid";

describe("balanced permission columns (at most six items each)", () => {
  it.each([
    [0, 0, 0, []],
    [3, 1, 3, [3]],
    [6, 1, 6, [6]],
    [7, 2, 4, [4, 3]],
    [13, 3, 5, [5, 4, 4]],
    [25, 5, 5, [5, 5, 5, 5, 5]],
  ] as const)("lays out %i permissions", (count, columns, rows, columnSizes) => {
    expect(permissionGridLayout(count)).toEqual({ columns, rows, columnSizes });
    expect(columnSizes.reduce<number>((sum, size) => sum + size, 0)).toBe(count);
    expect(columnSizes.every(size => size <= 6)).toBe(true);
  });
});
