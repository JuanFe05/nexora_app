import { describe, expect, it } from "vitest";
import { validateSignIn } from "./validation";

describe("validación de acceso", () => {
  it("exige identificador no vacío y contraseña no vacía", () => {
    expect(validateSignIn({ identificador: "  ", contrasena: "" })).toEqual({
      identificador: "Introduce tu usuario o correo electrónico.",
      contrasena: "Introduce tu contraseña.",
    });
  });
  it("admite usuario o correo y conserva contraseñas con espacios", () => {
    for (const identificador of [" usuario ", " usuario@example.com "]) {
      expect(validateSignIn({ identificador, contrasena: " " })).toEqual({});
    }
  });
});
