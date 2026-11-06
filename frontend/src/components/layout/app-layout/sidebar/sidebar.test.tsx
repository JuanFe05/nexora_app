// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { navigation } from "@/config/navigation";
import AppSidebar from "./index";

const { auth } = vi.hoisted(() => ({ auth: { roles: ["ADMINISTRADOR"] } }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);
beforeEach(() => { auth.roles = ["ADMINISTRADOR"]; });

function mount(open = true) {
  return render(<MemoryRouter><SidebarProvider defaultOpen={open}><AppSidebar /></SidebarProvider></MemoryRouter>);
}

it("configura secciones e iconos tipados para cada entrada", () => {
  expect(navigation.map((section) => section.title)).toEqual(["INFORMES", "CONFIGURACIONES"]);
  expect(navigation[0].items[0]).toMatchObject({ label: "Inicio", path: "/", icon: expect.any(Function) });
  for (const section of navigation) for (const item of section.items) expect(item.icon).toEqual(expect.any(Function));
});

it("administrador ve las cuatro opciones de configuración y los títulos", () => {
  mount();
  for (const title of ["INFORMES", "CONFIGURACIONES"]) expect(screen.getByRole("heading", { name: title })).toHaveClass("menu-group-title");
  for (const [label, path] of [["Perfil de usuario", "perfil"], ["Usuarios", "usuarios"], ["Permisos", "permisos"], ["Roles", "roles"]]) {
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `/configuracion/${path}`);
  }
  expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/configuracion/"))).toHaveLength(4);
});

it.each([{ roles: [] }, { roles: ["ESTADISTICA"] }, { roles: ["FACTURACION"] }])("no administrador $roles ve solo Perfil de usuario", ({ roles }) => {
  auth.roles = roles;
  mount();
  expect(screen.getByRole("link", { name: "Perfil de usuario" })).toBeVisible();
  for (const label of ["Usuarios", "Permisos", "Roles"]) expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
});

it("omite una sección cuando todas sus entradas requieren un rol ausente", () => {
  auth.roles = [];
  const section = { title: "SOLO ADMIN", items: [{ ...navigation[0].items[0], requiredRole: "ADMINISTRADOR" }] };
  navigation.push(section);
  try {
    mount();
    expect(screen.queryByRole("heading", { name: "SOLO ADMIN" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "SOLO ADMIN" })).not.toBeInTheDocument();
  } finally { navigation.pop(); }
});

it.each([true, false])("conserva Inicio activo e iconos expandido=%s", (open) => {
  mount(open);
  const link = screen.getByRole("link", { name: "Inicio" });
  expect(link).toHaveAttribute("href", "/");
  expect(link).toHaveAttribute("aria-current", "page");
  expect(link.querySelector("svg")).toHaveClass("size-6", "menu-item-icon-active");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  if (!open) {
    expect(screen.queryByText("INFORMES")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading").every((heading) => heading.querySelector("svg"))).toBe(true);
  }
});
