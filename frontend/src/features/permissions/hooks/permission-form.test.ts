import { describe, expect, it } from "vitest";
import { validatePermission } from "./permission-form";

const valid = { codigo: "identity.users.view", nombre: "Ver usuarios", modulo: "identity", descripcion: "" };
describe("permission validation mirrors the backend", () => {
  it("accepts dotted lowercase segments, underscores, digits and whitespace normalization", () => {
    expect(validatePermission({ ...valid, codigo: " identity_2.users_3.view ", descripcion: " descripción " })).toEqual({});
  });
  it.each(["", "users", "Identity.users", "identity..view", "identity.2users", "identity.users-", ".identity", "identity.", "a." + "b".repeat(99)])("rejects invalid permission code %s", codigo => {
    expect(validatePermission({ ...valid, codigo }).codigo).toBeTruthy();
  });
  it("reports required and length errors in Spanish", () => {
    expect(validatePermission({ ...valid, codigo: " ", nombre: " ", modulo: " " })).toEqual({ codigo: "El código es obligatorio.", nombre: "El nombre es obligatorio.", modulo: "El módulo es obligatorio." });
    expect(validatePermission({ ...valid, nombre: "a".repeat(101), modulo: "m".repeat(51), descripcion: "d".repeat(256) })).toEqual({ nombre: "El nombre no puede superar 100 caracteres.", modulo: "El módulo no puede superar 50 caracteres.", descripcion: "La descripción no puede superar 255 caracteres." });
    expect(validatePermission({ ...valid, nombre: "a".repeat(100), modulo: "m".repeat(50), descripcion: "d".repeat(255) })).toEqual({});
  });
  it("counts Unicode characters like the backend, not UTF-16 code units", () => {
    expect(validatePermission({ ...valid, nombre: "😀".repeat(100), modulo: "😀".repeat(50), descripcion: "😀".repeat(255) })).toEqual({});
    const errors = validatePermission({ ...valid, nombre: "😀".repeat(101), modulo: "😀".repeat(51), descripcion: "😀".repeat(256) });
    expect(errors.nombre).toBe("El nombre no puede superar 100 caracteres.");
    expect(errors.modulo).toBe("El módulo no puede superar 50 caracteres.");
    expect(errors.descripcion).toBe("La descripción no puede superar 255 caracteres.");
  });
  it("allows omitted description but rejects clearing an existing one because PATCH cannot clear it", () => {
    expect(validatePermission(valid, { ...valid, id: "1", descripcion: null })).toEqual({});
    expect(validatePermission(valid, { ...valid, id: "1", descripcion: "Descripción existente" }).descripcion).toBe("La descripción no puede quedar vacía al editarla.");
  });
});
