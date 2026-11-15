// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/contexts/theme-context";
import AppHeader from "./index";

vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ user: { id: "1", nombre_usuario: "admin", nombre_completo: "ADMINISTRADOR NEXORA", primer_nombre: "ADMINISTRADOR", primer_apellido: "NEXORA", correo: "a@b.co" }, logout: vi.fn() }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);

it("muestra solo selector de tema y menú de usuario, sin notificaciones", () => {
  render(<MemoryRouter><ThemeProvider><SidebarProvider><AppHeader /></SidebarProvider></ThemeProvider></MemoryRouter>);
  expect(screen.queryByRole("button", { name: /notificaci/i })).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: /Activar tema/ });
  const menu = screen.getByRole("button", { name: /Menú de usuario: admin/ });
  expect(toggle.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(menu.querySelector('[data-slot="user-avatar"]')).toHaveTextContent("AN");
  expect(menu).toHaveTextContent("admin");
});
