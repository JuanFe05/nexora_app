// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AccountSummary } from "./account-summary";

afterEach(cleanup);
const profile = { id: "1", nombre_usuario: "ana", correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null, estado: "ACTIVO", roles: ["ESTADISTICA"] };

it("muestra el estado real como texto normal, sin badge", () => {
  render(<AccountSummary profile={profile} />);
  const value = screen.getByText("Activo");
  expect(value.closest("dd")).toHaveTextContent("Activo");
  expect(value.closest("[data-slot='badge']")).toBeNull();
  expect(value.className).not.toMatch(/bg-|text-success|rounded/);
});

it("conserva el valor real cuando el usuario está inactivo", () => {
  render(<AccountSummary profile={{ ...profile, estado: "INACTIVO" }} />);
  expect(screen.getByText("Inactivo")).toBeInTheDocument();
});
