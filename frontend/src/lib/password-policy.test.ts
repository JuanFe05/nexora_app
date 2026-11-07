import { describe, expect, it } from "vitest";
import { evaluatePasswordPolicy, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULES, passwordMeetsPolicy } from "./password-policy";

describe("password policy", () => {
  it("exposes ordered requirements and exact limits", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(6);
    expect(PASSWORD_MAX_LENGTH).toBe(24);
    expect(PASSWORD_RULES.map(rule => rule.id)).toEqual(["length", "uppercase", "lowercase", "digit", "special"]);
    expect(evaluatePasswordPolicy("")).toEqual({ length: false, uppercase: false, lowercase: false, digit: false, special: false });
  });
  it.each([5, 6, 24, 25])("counts boundary %s", length => {
    const password = `Aa1!${"x".repeat(length - 4)}`;
    expect(evaluatePasswordPolicy(password).length).toBe(length >= 6 && length <= 24);
    expect(passwordMeetsPolicy(password)).toBe(length >= 6 && length <= 24);
  });
  it.each([["abc12!", "uppercase"], ["ABC12!", "lowercase"], ["Abcde!", "digit"], ["Abc123", "special"]] as const)("rejects missing class in %s", (password, missing) => {
    const evaluation = evaluatePasswordPolicy(password);
    expect(evaluation).toEqual({ length: true, uppercase: missing !== "uppercase", lowercase: missing !== "lowercase", digit: missing !== "digit", special: missing !== "special" });
    expect(passwordMeetsPolicy(password)).toBe(false);
  });
  it.each(["@", "#", "$", "%", "&", "!", "—", "😀"])("accepts punctuation or symbol %s", special => {
    expect(passwordMeetsPolicy(`Abc12${special}`)).toBe(true);
  });
  it("uses Unicode Lu, Ll and Nd (not ASCII or all numeric categories)", () => {
    expect(passwordMeetsPolicy("Éé١!xx")).toBe(true);
    expect(passwordMeetsPolicy("𐐀𐐨١!xx")).toBe(true);
    expect(evaluatePasswordPolicy("Ab²!xx").digit).toBe(false);
    expect(evaluatePasswordPolicy("ǅa1!xx").uppercase).toBe(false);
  });
  it("does not trim whitespace or count whitespace as special", () => {
    expect(passwordMeetsPolicy(" Ab1! ")).toBe(true);
    expect(passwordMeetsPolicy(` ${"Ab1!"}${"x".repeat(19)} `)).toBe(false);
    expect(evaluatePasswordPolicy("Ab1 \t\n")).toEqual({ length: true, uppercase: true, lowercase: true, digit: true, special: false });
  });
  it("counts non-BMP characters as single code points", () => {
    expect(passwordMeetsPolicy(`Ab1!${"😀".repeat(20)}`)).toBe(true);
    expect(passwordMeetsPolicy(`Ab1!${"😀".repeat(21)}`)).toBe(false);
  });
});
