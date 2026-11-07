import { describe, expect, it } from "vitest";
import { changedProfileFields, toProfileValues, validatePassword, validateProfile } from "./validation";

const original = { correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null };
const values = () => toProfileValues(original);

describe("validación del perfil", () => {
  it("acepta opcionales ausentes y envía solo campos modificados, recortados y permitidos", () => {
    expect(validateProfile(values(), original)).toEqual({});
    expect(changedProfileFields(original, { ...values(), correo: " nuevo@example.test ", nombre_usuario: "prohibido" } as ReturnType<typeof values>)).toEqual({ correo: "nuevo@example.test" });
    expect(changedProfileFields(original, { ...values(), primer_nombre: " Ana " })).toEqual({});
  });
  it.each(["primer_nombre", "primer_apellido", "correo"] as const)("exige %s", (field) => {
    expect(validateProfile({ ...values(), [field]: "   " }, original)[field]).toBeTruthy();
  });
  it.each(["primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido", "numero_telefono", "correo"] as const)("aplica límites exactos para %s", (field) => {
    const max = field === "correo" ? 255 : field === "numero_telefono" ? 30 : 100;
    const boundary = field === "correo" ? `${"a".repeat(248)}@a.test` : "a".repeat(max);
    expect(validateProfile({ ...values(), [field]: boundary }, original)[field]).toBeUndefined();
    expect(validateProfile({ ...values(), [field]: `${boundary}a` }, original)[field]).toBeTruthy();
  });
  it("rechaza correo inválido y no permite vaciar un opcional existente (PATCH no admite null ni vacío)", () => {
    expect(validateProfile({ ...values(), correo: "sin@dominio" }, original).correo).toBeTruthy();
    expect(validateProfile({ ...values(), segundo_nombre: " " }, { ...original, segundo_nombre: "María" }).segundo_nombre).toBeTruthy();
  });
});

describe("validación de contraseña", () => {
  const valid = { contrasena_actual: "actual", contrasena_nueva: "Abc123!x", confirmacion: "Abc123!x" };
  it("exige los tres campos", () => {
    expect(Object.keys(validatePassword({ contrasena_actual: "", contrasena_nueva: "", confirmacion: "" }))).toEqual(["contrasena_actual", "contrasena_nueva", "confirmacion"]);
  });
  it.each([6, 24])("acepta nueva con %s caracteres sin recortar", (length) => {
    const password = ` Ab1!${"n".repeat(length - 6)} `;
    expect(validatePassword({ ...valid, contrasena_nueva: password, confirmacion: password })).toEqual({});
  });
  it.each([5, 25])("rechaza nueva con %s caracteres", (length) => {
    expect(validatePassword({ ...valid, contrasena_nueva: "n".repeat(length) }).contrasena_nueva).toBeTruthy();
  });
  it.each(["abc12!", "ABC12!", "Abcde!", "Abc123", "Ab1   "])("rechaza clases ausentes en %s", password => {
    expect(validatePassword({ ...valid, contrasena_nueva: password, confirmacion: password })).toEqual({ contrasena_nueva: "La contraseña debe tener entre 6 y 24 caracteres, al menos una letra mayúscula, una minúscula, un número y un carácter especial." });
  });
  it.each(["x", "a".repeat(128)])("conserva contraseña actual legacy %s", actual => {
    expect(validatePassword({ ...valid, contrasena_actual: actual })).toEqual({});
  });
  it("limita actual a 128, rechaza igualdad y confirmación distinta", () => {
    expect(validatePassword({ ...valid, contrasena_actual: "a".repeat(129) }).contrasena_actual).toBeTruthy();
    expect(validatePassword({ ...valid, contrasena_actual: valid.contrasena_nueva }).contrasena_nueva).toBeTruthy();
    expect(validatePassword({ ...valid, confirmacion: "diferente" }).confirmacion).toBeTruthy();
  });
});
