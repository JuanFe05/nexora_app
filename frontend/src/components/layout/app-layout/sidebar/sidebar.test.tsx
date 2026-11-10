// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { navigation } from "@/config/navigation";
import AppSidebar from "./index";

const { auth } = vi.hoisted(() => ({ auth: { permissions: [] as string[], hasPermission: (code: string): boolean => auth.permissions.includes(code) } }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);
beforeEach(() => { auth.permissions = ["identity.users.view", "identity.roles.view", "identity.permissions.view"]; });

function mount(open = true) {
  return render(<MemoryRouter><SidebarProvider defaultOpen={open}><AppSidebar /></SidebarProvider></MemoryRouter>);
}

it("configura secciones e iconos tipados para cada entrada", () => {
  expect(navigation.map((section) => section.title)).toEqual(["ESTADÍSTICA", "CONFIGURACIONES"]);
  expect(navigation[0].items[0]).toMatchObject({ label: "Inicio", path: "/", icon: expect.any(Function) });
  for (const section of navigation) for (const item of section.items) expect(item.icon).toEqual(expect.any(Function));
});

it("todos los permisos view muestran las cuatro opciones de configuración y los títulos", () => {
  mount();
  for (const title of ["ESTADÍSTICA", "CONFIGURACIONES"]) expect(screen.getByRole("heading", { name: title })).toHaveClass("menu-group-title");
  for (const [label, path] of [["Perfil de usuario", "perfil"], ["Usuarios", "usuarios"], ["Permisos", "permisos"], ["Roles", "roles"]]) {
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `/configuracion/${path}`);
  }
  expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/configuracion/"))).toHaveLength(4);
});

it.each([
  { permissions: [], visible: [] },
  { permissions: ["identity.users.view"], visible: ["Usuarios"] },
  { permissions: ["identity.roles.view"], visible: ["Roles"] },
  { permissions: ["identity.permissions.view"], visible: ["Permisos"] },
  { permissions: ["identity.users.delete", "identity.roles.delete", "identity.permissions.delete"], visible: [] },
])("filtra por permisos efectivos: $permissions", ({ permissions, visible }) => {
  auth.permissions = permissions;
  mount();
  expect(screen.getByRole("link", { name: "Perfil de usuario" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
  for (const label of ["Usuarios", "Permisos", "Roles"]) {
    if (visible.includes(label)) expect(screen.getByRole("link", { name: label })).toBeVisible();
    else expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
  }
});

it("omite una sección cuando todas sus entradas requieren un permiso ausente", () => {
  auth.permissions = [];
  const section = { title: "SOLO ADMIN", items: [{ ...navigation[0].items[0], requiredPermission: "identity.roles.view" as const }] };
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
    expect(screen.queryByText("ESTADÍSTICA")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading").every((heading) => heading.querySelector("svg"))).toBe(true);
  }
});

it("organiza ESTADÍSTICA en cuatro grupos desplegables colapsados con sus opciones reales", () => {
  mount();
  for (const name of ["Informes", "Gestión Administrativa", "Resoluciones", "Circulares"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
  const informes = screen.getByRole("button", { name: "Informes" });
  const panel = document.getElementById(informes.getAttribute("aria-controls") as string) as HTMLElement;
  expect(panel).not.toBeVisible();
  fireEvent.click(informes);
  expect(informes).toHaveAttribute("aria-expanded", "true");
  for (const label of ["Facturas Detalladas", "Admisiones (Urgencias)", "Triaje (Urgencias)", "Signos Vitales"]) {
    expect(within(panel).getByText(label)).toHaveAttribute("aria-disabled", "true");
  }
  expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(informes);
  expect(informes).toHaveAttribute("aria-expanded", "false");
});

it.each(["Gestión Administrativa", "Resoluciones", "Circulares"])("el grupo %s muestra «Sin opciones aún» al expandir", (name) => {
  mount();
  const button = screen.getByRole("button", { name });
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  const panel = document.getElementById(button.getAttribute("aria-controls") as string) as HTMLElement;
  expect(within(panel).getByText("Sin opciones aún")).toBeVisible();
});

it("con el sidebar contraído muestra solo los iconos de los grupos", () => {
  mount(false);
  for (const name of ["Informes", "Resoluciones"]) {
    const button = screen.getByRole("button", { name });
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveAttribute("aria-expanded", "false");
  }
});
