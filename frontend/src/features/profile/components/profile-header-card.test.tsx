// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProfileHeaderCard } from "./profile-header-card";

afterEach(cleanup);
const profile = { id: "1", nombre_usuario: "ana", correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null, estado: "ACTIVO", roles: ["ESTADISTICA"] };

it("usa un fondo sólido de tarjeta, sin degradados, y conserva avatar, nombre, usuario, rol y estado", () => {
  const { container } = render(<ProfileHeaderCard profile={profile} />);
  const card = container.querySelector('[data-slot="card"]') as HTMLElement;
  expect(card).toHaveClass("bg-white", "border-gray-200", "shadow-theme-sm", "dark:bg-white/3", "dark:border-gray-800");
  expect(container.innerHTML).not.toMatch(/gradient|from-|via-|to-transparent/);
  expect(container.querySelectorAll("[aria-hidden='true'].absolute")).toHaveLength(0);
  expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
  expect(screen.getByText("AP")).toBeInTheDocument();
  expect(screen.getByText("@ana")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Roles asignados" })).toHaveTextContent("ESTADISTICA");
  expect(screen.getByText("Activo")).toBeInTheDocument();
});
