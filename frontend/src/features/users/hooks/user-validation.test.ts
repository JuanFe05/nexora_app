import { describe, expect, it } from "vitest";
import { changedUserFields, createUserBody, userValues, validateUser } from "./user-validation";
import type { User } from "../types";

const user: User = { id: "u", nombre_usuario: "ana", correo: "ana@example.org", primer_nombre: "Ana", primer_apellido: "Sol", segundo_nombre: null, segundo_apellido: null, numero_telefono: null, estado: "activo", roles: ["ADMINISTRADOR"] };
const values = { ...userValues(user), contrasena: "123456789012" };
describe("user validation and payloads", () => {
  it("requires creation fields, trims text but never trims a password", () => {
    expect(validateUser({ ...values, nombre_usuario: "  ", correo: "", primer_nombre: "", primer_apellido: "", contrasena: "" }, null)).toEqual({ nombre_usuario: "Este campo es obligatorio.", correo: "Este campo es obligatorio.", primer_nombre: "Este campo es obligatorio.", primer_apellido: "Este campo es obligatorio.", contrasena: "La contraseña debe tener entre 12 y 128 caracteres." });
    expect(validateUser({ ...values, contrasena: " ".repeat(12) }, null)).toEqual({});
    expect(createUserBody({ ...values, primer_nombre: " Ana ", contrasena: " 123456789012 " })).toEqual({ nombre_usuario: "ana", correo: "ana@example.org", primer_nombre: "Ana", primer_apellido: "Sol", contrasena: " 123456789012 " });
  });
  it.each([["nombre_usuario", 50], ["correo", 255], ["primer_nombre", 100], ["primer_apellido", 100], ["segundo_nombre", 100], ["segundo_apellido", 100], ["numero_telefono", 30], ["contrasena", 128]] as const)("enforces %s length %s", (field, max) => {
    expect(validateUser({ ...values, [field]: "a".repeat(max) }, null)[field]).toBeUndefined();
    expect(validateUser({ ...values, [field]: "a".repeat(max + 1) }, null)[field]).toBeTruthy();
  });
  it("mirrors the backend string email contract without inventing a format restriction", () => {
    expect(validateUser({ ...values, correo: "internal-address" }, null)).toEqual({});
    expect(validateUser({ ...values, contrasena: "a".repeat(11) }, null).contrasena).toBeTruthy();
    expect(validateUser({ ...values, contrasena: "" }, user)).toEqual({});
  });
  it("omits unchanged fields and nulls; rejects clearing an existing optional field", () => {
    expect(changedUserFields(user, { ...values, primer_nombre: " Ana ", estado: "inactivo", correo: "new" })).toEqual({ estado: "inactivo", correo: "new" });
    expect(changedUserFields(user, values)).toEqual({});
    expect(validateUser({ ...values, numero_telefono: "" }, { ...user, numero_telefono: "123" }).numero_telefono).toBe("El backend no permite vaciar este campo; conserva su valor o escribe uno nuevo.");
    expect(createUserBody({ ...values, segundo_nombre: " Luz " }).segundo_nombre).toBe("Luz");
  });
});
