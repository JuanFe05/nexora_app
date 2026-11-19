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
beforeEach(() => { auth.permissions = ["identity.users.view", "identity.roles.view", "identity.permissions.view", "statistics.reports.vital_signs.view"]; });

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

it("sin permisos efectivos no muestra nada del área ESTADÍSTICA (denegación por defecto)", () => {
  auth.permissions = [];
  mount();
  expect(screen.queryByRole("heading", { name: "ESTADÍSTICA" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "ESTADÍSTICA" })).not.toBeInTheDocument();
  for (const name of ["Informes", "Gestión Administrativa", "Resoluciones", "Circulares"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  for (const label of ["Inicio", "Facturas Detalladas", "Admisiones (Urgencias)", "Triaje (Urgencias)", "Signos Vitales"]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "Perfil de usuario" })).toBeVisible();
});

it("permisos ajenos a ESTADÍSTICA no revelan su área", () => {
  auth.permissions = ["identity.users.view", "identity.roles.view"];
  mount();
  expect(screen.queryByRole("navigation", { name: "ESTADÍSTICA" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Informes" })).not.toBeInTheDocument();
});

it("Admisiones y Triaje solo aparecen con su permiso propio", () => {
  auth.permissions = ["statistics.reports.admissions.view"];
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Informes" }));
  expect(screen.getByRole("link", { name: "Admisiones (Urgencias)" })).toHaveAttribute("href", "/estadistica/informes/admisiones");
  expect(screen.queryByText("Triaje (Urgencias)")).not.toBeInTheDocument();
});

it("muestra Triaje como enlace solo con su permiso independiente", () => {
  auth.permissions = ["statistics.reports.triage.view"];
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Informes" }));
  expect(screen.getByRole("link", { name: "Triaje (Urgencias)" })).toHaveAttribute("href", "/estadistica/informes/triaje");
  for (const label of ["Admisiones (Urgencias)", "Facturas Detalladas", "Signos Vitales"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
});

it("con todos los permisos de informes organiza el grupo Informes y lo colapsa", () => {
  auth.permissions = ["statistics.reports.detailed_invoices.view", "statistics.reports.vital_signs.view", "statistics.reports.admissions.view", "statistics.reports.triage.view"];
  mount();
  expect(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
  const informes = screen.getByRole("button", { name: "Informes" });
  expect(informes).toHaveAttribute("aria-expanded", "false");
  const panel = document.getElementById(informes.getAttribute("aria-controls") as string) as HTMLElement;
  expect(panel).not.toBeVisible();
  fireEvent.click(informes);
  expect(informes).toHaveAttribute("aria-expanded", "true");
  expect(within(panel).getAllByRole("link")).toHaveLength(4);
  expect(within(panel).getByRole("link", { name: "Triaje (Urgencias)" })).toHaveAttribute("href", "/estadistica/informes/triaje");
  fireEvent.click(informes);
  expect(informes).toHaveAttribute("aria-expanded", "false");
});

it("muestra Facturas Detalladas como enlace solo con su permiso efectivo", () => {
  auth.permissions = ["statistics.reports.detailed_invoices.view"];
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Informes" }));
  expect(screen.getByRole("link", { name: "Facturas Detalladas" })).toHaveAttribute("href", "/estadistica/informes/facturas-detalladas");
  for (const label of ["Admisiones (Urgencias)", "Triaje (Urgencias)"]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(screen.queryByText("Signos Vitales")).not.toBeInTheDocument();
});

it("muestra Signos Vitales solo con su permiso independiente", () => {
  auth.permissions = ["statistics.reports.vital_signs.view"];
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Informes" }));
  expect(screen.getByRole("link", { name: "Signos Vitales" })).toHaveAttribute("href", "/estadistica/informes/signos-vitales");
  expect(screen.queryByText("Facturas Detalladas")).not.toBeInTheDocument();
  expect(navigation[0].groups?.[0].items.find((item) => item.label === "Signos Vitales")?.requiredPermission).toBe("statistics.reports.vital_signs.view");
});

it("con el sidebar contraído muestra solo los iconos de los grupos", () => {
  mount(false);
  const button = screen.getByRole("button", { name: "Informes" });
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(button).toHaveAttribute("aria-expanded", "false");
});

const MENUS = {
  Resoluciones: [
    ["Resolución 202 de 2021", "statistics.resolutions.res_202_2021.view"],
    ["Resolución 373 de 2026", "statistics.resolutions.res_373_2026.view"],
    ["Resolución 1552 de 2013", "statistics.resolutions.res_1552_2013.view"],
    ["Resolución 256 de 2016", "statistics.resolutions.res_256_2016.view"],
    ["Resolución 2175 de 2015", "statistics.resolutions.res_2175_2015.view"],
  ],
  Circulares: [
    ["Circular 06 de 2018", "statistics.circulars.circular_06_2018.view"],
    ["Circular 21 de 2026", "statistics.circulars.circular_21_2026.view"],
  ],
  "Gestión Administrativa": [
    ["Consumo General", "statistics.administrative.general_consumption.view"],
    ["Facturación General", "statistics.administrative.general_billing.view"],
    ["Consumo de Laboratorio", "statistics.administrative.lab_consumption.view"],
    ["Gestión de Incapacidades", "statistics.administrative.disability_management.view"],
    ["Encuestas de Calidad", "statistics.administrative.quality_surveys.view"],
    ["Secretaría Gerencia", "statistics.administrative.management_secretariat.view"],
    ["Notificación SIVIGILA", "statistics.administrative.sivigila.view"],
  ],
} as const;

it("define los menús con los nombres exactos y un permiso por opción", () => {
  const groups = navigation[0].groups ?? [];
  for (const [menu, options] of Object.entries(MENUS)) {
    const group = groups.find((candidate) => candidate.label === menu);
    expect(group?.items.map((item) => [item.label, item.requiredPermission])).toEqual(options.map(([label, code]) => [label, code]));
  }
});

it.each(Object.entries(MENUS))("%s: sin permisos no aparece y con un permiso muestra solo esa opción", (menu, options) => {
  auth.permissions = [];
  const { unmount } = mount();
  expect(screen.queryByRole("button", { name: menu })).not.toBeInTheDocument();
  unmount();
  auth.permissions = [options[0][1]];
  mount();
  const button = screen.getByRole("button", { name: menu });
  fireEvent.click(button);
  const panel = document.getElementById(button.getAttribute("aria-controls") as string) as HTMLElement;
  expect(within(panel).getByText(options[0][0])).toHaveAttribute("aria-disabled", "true");
  for (const [label] of options.slice(1)) expect(within(panel).queryByText(label)).not.toBeInTheDocument();
});

it("expandido: isotipo antes de NEXORA, alineados verticalmente y centrados", () => {
  mount(true);
  const link = screen.getByRole("link", { name: "NEXORA" });
  expect(link).toHaveClass("flex", "items-center", "justify-center");
  const logo = link.querySelector('img[src="/images/logo/Nexora_Logo.svg"]') as HTMLElement;
  expect(logo).toHaveAttribute("alt", "");
  expect(logo).toHaveAttribute("aria-hidden", "true");
  expect(link).toHaveTextContent("NEXORA");
  expect(logo.compareDocumentPosition(link.querySelector("span") as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("contraído: solo el isotipo, centrado, sin texto ni inicial", () => {
  mount(false);
  const link = screen.getByRole("link", { name: "NEXORA" });
  expect(link).toHaveClass("flex", "items-center", "justify-center");
  expect(link.querySelector('img[src="/images/logo/Nexora_Logo.svg"]')).not.toBeNull();
  expect(link.textContent).toBe("");
});
