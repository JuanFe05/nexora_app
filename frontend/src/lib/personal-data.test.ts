import { expect, it } from "vitest";
import { normalizeField, normalizeName } from "./personal-data";

it("uppercases names keeping Spanish accents and collapsing spaces", () => {
  expect(normalizeName("  josé   luis ")).toBe("JOSÉ LUIS");
  expect(normalizeName("muñoz peña")).toBe("MUÑOZ PEÑA");
  expect(normalizeName("ángel")).toBe("ÁNGEL");
});

it("lowercases usernames and emails, trims phones and leaves passwords out", () => {
  expect(normalizeField("nombre_usuario", " JPérez ")).toBe("jpérez");
  expect(normalizeField("correo", " Ana@Example.COM ")).toBe("ana@example.com");
  expect(normalizeField("primer_apellido", " gómez ")).toBe("GÓMEZ");
  expect(normalizeField("numero_telefono", " 3001234567 ")).toBe("3001234567");
});
