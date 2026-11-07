import { describe, expect, it } from "vitest";
import { validateRole } from "./role-validation";
const values = { codigo: "VENTAS", nombre: "Ventas", descripcion: "", estado: "activo" as const };
describe("role validation mirrors backend trimmed lengths and immutable code", () => {
  it("accepts optional description and the exact code/length boundaries", () => {
    expect(validateRole(values)).toEqual({});
    expect(validateRole({ ...values, codigo: "A_", nombre: " a ", descripcion: " x " })).toEqual({});
    expect(validateRole({ ...values, codigo: `A${"0".repeat(49)}`, nombre: "n".repeat(100), descripcion: "d".repeat(255) })).toEqual({});
  });
  it.each(["", "A", "ventas", "1VENTAS", "AA-", `A${"0".repeat(50)}`])("rejects invalid code %s", codigo => {
    expect(validateRole({ ...values, codigo }).codigo).toBe("Usa de 2 a 50 caracteres: mayúsculas, números o guion bajo; empieza con una letra.");
  });
  it.each(["", "   ", "n".repeat(101)])("rejects invalid name", nombre => {
    expect(validateRole({ ...values, nombre }).nombre).toBe("El nombre debe tener entre 1 y 100 caracteres.");
  });
  it("keeps trimmed Unicode code-point boundaries without changing the supplied text", () => {
    const description = `  ${"😀".repeat(255)}  `;
    const supplied = { ...values, descripcion: description };
    expect(validateRole(supplied)).toEqual({});
    expect(supplied.descripcion).toBe(description);
    expect(validateRole({ ...values, descripcion: ` ${"😀".repeat(256)} ` })).toEqual({ descripcion: "La descripción debe tener entre 1 y 255 caracteres." });
  });
  it("rejects an oversized description and clearing a saved description (PATCH cannot send null or empty)", () => {
    expect(validateRole({ ...values, descripcion: "d".repeat(256) }).descripcion).toBe("La descripción debe tener entre 1 y 255 caracteres.");
    expect(validateRole(values, { descripcion: "Existente" }).descripcion).toBe("No se puede vaciar una descripción existente; escribe una nueva.");
    expect(validateRole({ ...values, codigo: "inmutable" }, { descripcion: null })).toEqual({});
  });
});
