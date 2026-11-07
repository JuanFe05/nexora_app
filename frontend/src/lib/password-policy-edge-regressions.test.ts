import { describe, expect, it } from "vitest";
import { evaluatePasswordPolicy, passwordMeetsPolicy } from "./password-policy";

describe("Unicode password policy edge regressions", () => {
  it.each([
    ["Ab1\u00a0\u2003\u200b", false],
    ["Ab1\u0301xx", false],
    ["ǅab1!x", false],
    ["Ab²!xx", false],
    ["𐐀𐐨١😀xx", true],
    ["Ab1😀" + "x".repeat(20), true],
    ["Ab1😀" + "x".repeat(21), false],
    [" Ab1! ", true],
  ] as const)("evaluates %j as %s", (password, accepted) => {
    expect(passwordMeetsPolicy(password)).toBe(accepted);
  });

  it("does not classify whitespace or formatting characters as specials", () => {
    expect(evaluatePasswordPolicy("Ab1\u00a0\u2003\u200b")).toEqual({
      length: true, uppercase: true, lowercase: true, digit: true, special: false,
    });
  });
});
