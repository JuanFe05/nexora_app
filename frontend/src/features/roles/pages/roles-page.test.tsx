// @vitest-environment jsdom
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { PERMISSIONS as P } from "@/features/auth/permissions";

const auth = vi.hoisted(() => ({ codes: new Set<string>() }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ hasPermission: (code: string) => auth.codes.has(code) }) }));
import * as api from "../api/roles-api";
import * as options from "../api/permission-options";
import type { Role } from "../types";
import RolesPage from "./roles-page";

vi.mock("../api/roles-api", async importOriginal => {
  const original = await importOriginal<typeof api>();
  return { ...original, listRoles: vi.fn(), createRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn(), assignPermission: vi.fn(), revokePermission: vi.fn() };
});
vi.mock("../api/permission-options", () => ({ loadPermissionOptions: vi.fn() }));
const role: Role = { id: "r1", codigo: "VENTAS", nombre: "Ventas", descripcion: "Equipo comercial", estado: "activo", permisos: ["ventas.ver"] };
const catalog = [
  { id: "p1", codigo: "ventas.ver", nombre: "Ver ventas", modulo: "Ventas", descripcion: null },
  { id: "p2", codigo: "ventas.editar", nombre: "Editar ventas", modulo: "Ventas", descripcion: null },
  { id: "p3", codigo: "caja.ver", nombre: "Ver caja", modulo: "Caja", descripcion: null },
];
beforeEach(() => {
  auth.codes = new Set(Object.values(P));
  vi.mocked(api.listRoles).mockResolvedValue({ items: [role], total: 21 });
  vi.mocked(options.loadPermissionOptions).mockResolvedValue(catalog);
  vi.mocked(api.createRole).mockResolvedValue({ ...role, descripcion: null, permisos: [] });
  vi.mocked(api.updateRole).mockImplementation(async (previous, values) => ({ ...previous, ...values }));
  vi.mocked(api.assignPermission).mockResolvedValue(role);
  vi.mocked(api.revokePermission).mockResolvedValue(undefined);
  vi.mocked(api.deleteRole).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });
async function openEdit() {
  render(<ToastProvider><RolesPage /></ToastProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "Editar Ventas" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar rol" });
  if (auth.codes.has(P.permissionsView)) await expandPermissions();
  return dialog;
}
async function expandPermissions() {
  await userEvent.click(await screen.findByRole("button", { name: "Expandir todos" }));
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }

describe("granular permissions and FormDialog", () => {
  it.each([
    ["view", [], false, false, false],
    ["create", [P.rolesCreate], true, false, false],
    ["update", [P.rolesUpdate], false, true, false],
    ["delete", [P.rolesDelete], false, false, true],
    ["assign without catalog", [P.rolesAssignPermissions], false, true, false],
    ["assign with catalog", [P.rolesAssignPermissions, P.permissionsView], false, true, false],
    ["all", Object.values(P), true, true, true],
  ] as const)("shows independent actions: %s", async (_name, codes, create, edit, remove) => {
    auth.codes = new Set([P.rolesView, ...codes]);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await screen.findByText("VENTAS");
    expect(!!screen.queryByRole("button", { name: "Nuevo rol" })).toBe(create);
    expect(!!screen.queryByRole("button", { name: "Editar Ventas" })).toBe(edit);
    expect(!!screen.queryByRole("button", { name: "Eliminar Ventas" })).toBe(remove);
    expect(options.loadPermissionOptions).not.toHaveBeenCalled();
  });

  it.each([
    ["update only", [P.rolesUpdate], true, false, false],
    ["update and catalog", [P.rolesUpdate, P.permissionsView], true, false, true],
    ["assign without catalog", [P.rolesAssignPermissions], false, false, false],
    ["assign with catalog", [P.rolesAssignPermissions, P.permissionsView], false, true, true],
    ["all", Object.values(P), true, true, true],
  ] as const)("gates edit fields and outgoing mutations: %s", async (_name, codes, fields, permissions, catalogAccess) => {
    auth.codes = new Set([P.rolesView, ...codes]);
    const dialog = await openEdit();
    expect(screen.getByLabelText("Nombre", { exact: true }).hasAttribute("readonly")).toBe(!fields);
    expect(screen.getByLabelText("Descripción", { exact: true }).hasAttribute("readonly")).toBe(!fields);
    expect(screen.getByLabelText("Estado", { exact: true })).toHaveProperty("disabled", !fields);
    if (catalogAccess) {
      const checkbox = await screen.findByRole("checkbox", { name: "Ver caja" });
      expect(checkbox.getAttribute("aria-disabled") === "true").toBe(!permissions);
      await userEvent.click(checkbox);
      expect(options.loadPermissionOptions).toHaveBeenCalledTimes(1);
    } else {
      expect(options.loadPermissionOptions).not.toHaveBeenCalled();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      if ((codes as readonly string[]).includes(P.rolesAssignPermissions)) expect(screen.getByText(/Se requiere.*identity.permissions.view/)).toBeVisible();
    }
    if (fields) {
      change("Nombre", "Comercial");
      change("Descripción", "Nueva descripción");
      fireEvent.change(screen.getByLabelText("Estado", { exact: true }), { target: { value: "inactivo" } });
    }
    if (fields || permissions) await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    else {
      expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
      const footer = dialog.querySelector('[data-slot="dialog-footer"]') as HTMLElement;
      expect(within(footer).getByRole("button", { name: "Cerrar" })).toBeVisible();
      await userEvent.click(within(footer).getByRole("button", { name: "Cerrar" }));
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    if (fields) expect(api.updateRole).toHaveBeenCalledExactlyOnceWith(role, { nombre: "Comercial", descripcion: "Nueva descripción", estado: "inactivo" });
    else expect(api.updateRole).not.toHaveBeenCalled();
    if (permissions) expect(api.assignPermission).toHaveBeenCalledExactlyOnceWith("r1", "p3");
    else expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
    expect(api.createRole).not.toHaveBeenCalled();
    expect(api.deleteRole).not.toHaveBeenCalled();
  });

  it.each([
    ["create only", [P.rolesCreate], false],
    ["create and catalog without assign", [P.rolesCreate, P.permissionsView], false],
    ["create and assign without catalog", [P.rolesCreate, P.rolesAssignPermissions], false],
    ["all", Object.values(P), true],
  ] as const)("gates creation permission selection: %s", async (_name, codes, selectable) => {
    auth.codes = new Set([P.rolesView, ...codes]);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    if (selectable) {
      await expandPermissions();
      await userEvent.click(screen.getByRole("checkbox", { name: "Ver caja" }));
    }
    else {
      expect(options.loadPermissionOptions).not.toHaveBeenCalled();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledExactlyOnceWith({ codigo: "VENTAS", nombre: "Ventas", descripcion: "" });
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.assignPermission).toHaveBeenCalledTimes(selectable ? 1 : 0);
    if (selectable) expect(api.assignPermission).toHaveBeenCalledWith("r1", "p3");
    expect(api.revokePermission).not.toHaveBeenCalled();
  });

  it.each(["Escape", "Cancelar", "Cerrar"])("uses centered scrollable dialog and closes via %s without writes", async method => {
    const dialog = await openEdit();
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog.className).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(dialog.querySelector(".overflow-y-auto")).toContainElement(await screen.findByRole("region", { name: "Permisos del rol" }));
    if (method === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(screen.getByRole("button", { name: method }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
  });

  it("allows delete without create, update or assignment and sends only the selected id", async () => {
    auth.codes = new Set([P.rolesView, P.rolesDelete]);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Ventas" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteRole).toHaveBeenCalledExactlyOnceWith("r1");
    expect(api.createRole).not.toHaveBeenCalled();
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
    expect(options.loadPermissionOptions).not.toHaveBeenCalled();
  });

  it("shows the backend 403 detail and preserves the edit for retry", async () => {
    vi.mocked(api.updateRole).mockRejectedValue(new ApiError(403, "No puedes cambiar este rol", {}));
    await openEdit(); change("Nombre", "Comercial");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No puedes cambiar este rol");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveValue("Comercial");
    expect(api.assignPermission).not.toHaveBeenCalled();
  });
});

describe("role form presentation", () => {
  it("creates with only crear selected, without implicitly granting ver or other actions", async () => {
    vi.mocked(options.loadPermissionOptions).mockResolvedValue([
      { id: "create", codigo: "identity.users.create", nombre: "Crear usuarios", modulo: "identity", descripcion: null },
      { id: "view", codigo: "identity.users.view", nombre: "Consultar usuarios", modulo: "identity", descripcion: null },
    ]);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "EQUIPO"); change("Nombre", "Equipo");
    const trigger = await screen.findByRole("button", { name: "identity" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("checkbox", { name: "Crear usuarios" }));
    expect(screen.getByRole("checkbox", { name: "Consultar usuarios" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledExactlyOnceWith({ codigo: "EQUIPO", nombre: "Equipo", descripcion: "" });
    expect(api.assignPermission).toHaveBeenCalledExactlyOnceWith("r1", "create");
    expect(api.revokePermission).not.toHaveBeenCalled();
    expect(api.updateRole).not.toHaveBeenCalled();
  });

  it("starts edit collapsed with current permissions loaded, preserving permissions outside the catalog", async () => {
    vi.mocked(api.listRoles).mockResolvedValue({ items: [{ ...role, permisos: [...role.permisos, "legacy.permission"] }], total: 1 });
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Editar Ventas" }));
    const trigger = await screen.findByRole("button", { name: "Ventas" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByRole("checkbox", { name: "Ver ventas" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar todos" }));
    await userEvent.click(screen.getByRole("button", { name: "Deseleccionar todos" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.revokePermission).toHaveBeenCalledExactlyOnceWith("r1", "p1");
    expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.createRole).not.toHaveBeenCalled();
  });

  it.each(["create", "edit"])("uses the same wider, responsive form and live description counter in %s", async mode => {
    let dialog: HTMLElement;
    if (mode === "edit") dialog = await openEdit();
    else {
      render(<ToastProvider><RolesPage /></ToastProvider>);
      await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
      dialog = await screen.findByRole("dialog", { name: "Nuevo rol" });
    }
    expect(dialog).toHaveClass("sm:max-w-6xl");
    const info = within(dialog).getByRole("region", { name: "Información del rol" });
    const panel = dialog.querySelector('[data-slot="role-permissions-panel"]')!;
    expect(info.parentElement).toBe(panel.parentElement);
    expect(info.parentElement).toHaveClass("grid-cols-1", "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    expect(info).toHaveClass("border", "rounded-xl", "dark:border-gray-800");
    expect(panel).toHaveClass("border", "rounded-xl", "dark:border-gray-800");
    expect(info.parentElement?.firstElementChild).toBe(info);
    const codeField = screen.getByLabelText("Código", { exact: true }).closest('[data-slot="field"]')!;
    const nameField = screen.getByLabelText("Nombre", { exact: true }).closest('[data-slot="field"]')!;
    expect(codeField.parentElement).toBe(nameField.parentElement);
    expect(codeField.parentElement).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-2");
    const description = screen.getByLabelText("Descripción", { exact: true });
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveAttribute("maxlength", "255");
    const counter = dialog.querySelector('#role-description-counter')!;
    expect(counter).toHaveAttribute("aria-live", "polite");
    expect(description).toHaveAttribute("aria-describedby", "role-description-counter");
    expect(counter).toHaveTextContent(`${mode === "edit" ? 16 : 0}/255`);
    change("Descripción", "  😀texto  ");
    expect(counter).toHaveTextContent("6/255");
    change("Descripción", "d".repeat(230));
    expect(counter).toHaveClass("text-warning-600", "dark:text-warning-400");
    change("Descripción", "d".repeat(255));
    expect(counter).toHaveTextContent("255/255");
    expect(counter).toHaveClass("text-red-500", "dark:text-red-400");
    await userEvent.type(description, "x");
    expect(description).toHaveValue("d".repeat(255));
    expect(api.createRole).not.toHaveBeenCalled();
    expect(api.updateRole).not.toHaveBeenCalled();
  });

  it.each(["create", "edit"])("validates an oversized description, focuses it and blocks all writes in %s", async mode => {
    if (mode === "edit") await openEdit();
    else {
      render(<ToastProvider><RolesPage /></ToastProvider>);
      await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
      change("Código", "VENTAS"); change("Nombre", "Ventas");
    }
    if (mode === "create") await expandPermissions();
    await screen.findByRole("checkbox", { name: "Ver caja" });
    change("Descripción", "😀".repeat(256));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    const description = screen.getByLabelText("Descripción", { exact: true });
    expect(screen.getByText("La descripción debe tener entre 1 y 255 caracteres.")).toBeVisible();
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAttribute("aria-describedby", "role-description-counter role-descripcion-error");
    expect(description).toHaveFocus();
    expect(description).toHaveValue("😀".repeat(256));
    expect(screen.getByText(`${mode === "edit" ? 1 : 0} de 2 seleccionados`)).toBeVisible();
    expect(api.createRole).not.toHaveBeenCalled();
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
  });

  it("preserves multiline text and whitespace at the existing save boundary", async () => {
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", " VENTAS "); change("Nombre", " Ventas ");
    change("Descripción", "  Primera línea\n😀 Segunda línea  ");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar todos de Ventas" }));
    expect(screen.getByText("2 de 2 seleccionados")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledExactlyOnceWith({ codigo: " VENTAS ", nombre: " Ventas ", descripcion: "  Primera línea\n😀 Segunda línea  " });
    expect(vi.mocked(api.assignPermission).mock.calls).toEqual([["r1", "p1"], ["r1", "p2"]]);
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
  });

  it.each([3, 6, 7, 13, 25])("renders %i real permissions in two responsive columns and keeps select-all/counter/payload", async count => {
    const permissions = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, codigo: `modulo.p${index}`, nombre: `Permiso ${index}`, modulo: "Módulo", descripcion: null }));
    vi.mocked(options.loadPermissionOptions).mockResolvedValue(permissions);
    vi.mocked(api.listRoles).mockResolvedValue({ items: [{ ...role, permisos: [] }], total: 1 });
    await openEdit();
    const group = await screen.findByRole("group", { name: "Módulo" });
    const grid = group.querySelector('[data-slot="permission-grid"]')!;
    expect(grid).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-2");
    expect(grid.children).toHaveLength(count);
    expect(within(grid as HTMLElement).getAllByRole("checkbox").map(checkbox => checkbox.getAttribute("aria-label"))).toEqual(permissions.map(permission => permission.nombre));
    expect(within(group).getByText(`0 de ${count} seleccionados`)).toBeVisible();
    await userEvent.click(within(group).getByRole("checkbox", { name: "Seleccionar todos de Módulo" }));
    expect(within(group).getByText(`${count} de ${count} seleccionados`)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(vi.mocked(api.assignPermission).mock.calls).toEqual(permissions.map(permission => ["r1", permission.id]));
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
  });
});

describe("Roles page", () => {
  it("uses the main Users heading hierarchy without replacing the table heading", async () => {
    render(<ToastProvider><RolesPage /></ToastProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "Administración de roles" })).toHaveClass("text-title-lg", "font-semibold", "text-gray-800", "dark:text-white/90");
    expect(screen.getByRole("heading", { level: 2, name: "Roles" })).toBeVisible();
    await screen.findByText("VENTAS");
  });
  it("lists real rows with count/summary, pages and page size from the shared query", async () => {
    render(<ToastProvider><RolesPage /></ToastProvider>);
    expect(await screen.findByText("VENTAS")).toBeVisible();
    expect(screen.getByRole("table", { name: "Roles" })).toBeVisible();
    for (const header of ["Código", "Nombre", "Descripción", "Estado", "Permisos", "Acciones"]) expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    expect(screen.getByText("ventas.ver")).toBeVisible();
    expect(screen.getByText("Activo")).toBeVisible();
    expect(screen.getByText("Mostrando 1 a 10 de 21 registros")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(api.listRoles).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10, offset: 10 })));
    fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: "25" } });
    await waitFor(() => expect(api.listRoles).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 0 })));
  });
  it("debounces server search by 300 ms", async () => {
    vi.useFakeTimers();
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "venta" } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(api.listRoles).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.listRoles).toHaveBeenLastCalledWith(expect.objectContaining({ q: "venta", offset: 0 }));
  });
  it("validates fields in Spanish, marks invalid and focuses first; no API writes", async () => {
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByLabelText("Código", { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(screen.getByLabelText("Código", { exact: true })).toHaveFocus());
    expect(screen.getByText(/Usa de 2 a 50 caracteres/)).toBeVisible();
    expect(api.createRole).not.toHaveBeenCalled();
  });
  it("creates a role and assigns selected permissions after creation", async () => {
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    await expandPermissions();
    await userEvent.click(screen.getByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledExactlyOnceWith({ codigo: "VENTAS", nombre: "Ventas", descripcion: "" });
    expect(api.assignPermission).toHaveBeenCalledExactlyOnceWith("r1", "p3");
    expect(screen.getByText("Rol creado correctamente.")).toBeVisible();
    expect(api.listRoles).toHaveBeenCalledTimes(2);
  });
  it("keeps duplicate 409 message in dialog without changing permissions", async () => {
    vi.mocked(api.createRole).mockRejectedValue(new ApiError(409, "Ya existe un rol con ese código", {}));
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un rol con ese código");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Código", { exact: true })).toHaveValue("VENTAS");
    expect(api.assignPermission).not.toHaveBeenCalled();
  });
  it("edits immutable code and saves one metadata update then the permission diff", async () => {
    await openEdit();
    expect(screen.getByLabelText("Código", { exact: true })).toHaveAttribute("readonly");
    change("Nombre", "Comercial");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Ver ventas" }));
    expect(screen.getByRole("checkbox", { name: "Ver ventas" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Editar ventas" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).toHaveBeenCalledExactlyOnceWith(role, { nombre: "Comercial", descripcion: "Equipo comercial", estado: "activo" });
    expect(api.assignPermission).toHaveBeenCalledExactlyOnceWith("r1", "p2");
    expect(api.revokePermission).toHaveBeenCalledExactlyOnceWith("r1", "p1");
    expect(vi.mocked(api.updateRole).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.assignPermission).mock.invocationCallOrder[0]);
    expect(screen.getByText("Rol actualizado correctamente.")).toBeVisible();
  });
  it("groups by module, counts selection, and selects/clears an entire module", async () => {
    await openEdit();
    const group = await screen.findByRole("group", { name: "Ventas" });
    expect(within(group).getByText("1 de 2 seleccionados")).toBeVisible();
    const all = within(group).getByRole("checkbox", { name: "Seleccionar todos de Ventas" });
    expect(all).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(all);
    expect(within(group).getByText("2 de 2 seleccionados")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Ver caja" })).not.toBeChecked();
    await userEvent.click(all);
    expect(within(group).getByText("0 de 2 seleccionados")).toBeVisible();
  });
  it("keeps partial edit open, reloads table and retries only unfinished permission changes", async () => {
    vi.mocked(api.assignPermission).mockResolvedValueOnce(role).mockRejectedValueOnce(new ApiError(409, "Conflicto de permiso", {})).mockResolvedValue(role);
    await openEdit(); change("Nombre", "Comercial");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Editar ventas" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo asignar el permiso Ver caja. Conflicto de permiso");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(api.listRoles).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.assignPermission).mock.calls).toEqual([["r1", "p2"], ["r1", "p3"], ["r1", "p3"]]);
  });
  it("retains a created role after assignment failure and never creates it twice on retry", async () => {
    vi.mocked(api.assignPermission).mockRejectedValueOnce(new ApiError(403, "Forbidden", {})).mockResolvedValue(role);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    await expandPermissions();
    await userEvent.click(screen.getByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El rol se creó y se conserva.");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo asignar el permiso Ver caja.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledTimes(1);
    expect(api.updateRole).not.toHaveBeenCalled();
  });
  it("protects all system role deletions and locks ADMINISTRADOR status/permissions", async () => {
    vi.mocked(api.listRoles).mockResolvedValue({ items: ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION"].map((codigo, i) => ({ ...role, id: String(i), codigo, nombre: codigo })), total: 3 });
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await screen.findByRole("button", { name: "Editar ADMINISTRADOR" });
    for (const code of ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION"]) expect(screen.queryByRole("button", { name: `Eliminar ${code}` })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Editar ADMINISTRADOR" }));
    expect(screen.getByLabelText("Estado", { exact: true })).toBeDisabled();
    await expandPermissions();
    await screen.findByRole("checkbox", { name: "Ver ventas" });
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toHaveAttribute("aria-disabled", "true");
    const protectedPermission = screen.getByRole("checkbox", { name: "Ver ventas" });
    await userEvent.click(protectedPermission);
    expect(protectedPermission).toBeChecked();
    expect(screen.getByText("Los permisos de ADMINISTRADOR están protegidos por el sistema.")).toBeVisible();
    expect(api.deleteRole).not.toHaveBeenCalled();
  });
  it("delete cancel does not mutate; 409 stays visible and retry succeeds", async () => {
    vi.mocked(api.deleteRole).mockRejectedValueOnce(new ApiError(409, "El rol tiene usuarios asignados", {})).mockResolvedValue(undefined);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Ventas" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteRole).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar Ventas" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El rol tiene usuarios asignados");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteRole).toHaveBeenLastCalledWith("r1");
    expect(screen.getByText("Rol eliminado correctamente.")).toBeVisible();
  });
  it("shows server error with retry then the empty state", async () => {
    vi.mocked(api.listRoles).mockRejectedValueOnce(new ApiError(403, "Forbidden", {})).mockResolvedValue({ items: [], total: 0 });
    render(<ToastProvider><RolesPage /></ToastProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay roles")).toBeVisible();
  });
  it("keeps metadata errors open and does not start permission mutations", async () => {
    vi.mocked(api.updateRole).mockRejectedValue(new ApiError(422, "invalid", {}));
    await openEdit();
    change("Nombre", "Comercial");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar el rol. Revisa los datos del formulario.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
    await waitFor(() => expect(api.listRoles).toHaveBeenCalledTimes(2));
  });
  it("reports a failed revocation without closing or pretending the permission was removed", async () => {
    vi.mocked(api.revokePermission).mockRejectedValueOnce(new ApiError(404, "gone", {})).mockResolvedValue(undefined);
    await openEdit();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Ver ventas" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo revocar el permiso Ver ventas. El rol o permiso ya no existe.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(api.updateRole).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.revokePermission).toHaveBeenCalledTimes(2);
  });
  it("requires a complete catalog, retries loading and preserves unsaved input", async () => {
    vi.mocked(options.loadPermissionOptions).mockRejectedValueOnce(new ApiError(401, "expired", {})).mockResolvedValue(catalog);
    render(<ToastProvider><RolesPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo de permisos. Sesión expirada.");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(api.createRole).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar catálogo" }));
    await expandPermissions();
    expect(screen.getByRole("checkbox", { name: "Ver caja" })).not.toBeChecked();
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveValue("Ventas");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledTimes(1);
  });
  it("locks controls and cancellation while a save is pending", async () => {
    let resolve!: (value: Role) => void;
    vi.mocked(api.updateRole).mockImplementation(() => new Promise<Role>(done => { resolve = done; }));
    await openEdit();
    await screen.findByRole("checkbox", { name: "Ver caja" });
    change("Nombre", "Comercial");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText("Nombre", { exact: true })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => resolve({ ...role, nombre: "Comercial" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).toHaveBeenCalledTimes(1);
  });
  it("does not write anything on unchanged save or cancel", async () => {
    await openEdit();
    await screen.findByRole("checkbox", { name: "Ver ventas" });
    expect(screen.getByRole("checkbox", { name: "Ver ventas" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).not.toHaveBeenCalled();
    expect(api.assignPermission).not.toHaveBeenCalled();
    expect(api.revokePermission).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Editar Ventas" }));
    change("Nombre", "Sin guardar");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.updateRole).not.toHaveBeenCalled();
  });
});
