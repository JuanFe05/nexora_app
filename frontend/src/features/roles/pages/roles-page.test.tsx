// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
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
  render(<RolesPage />);
  await userEvent.click(await screen.findByRole("button", { name: "Editar Ventas" }));
  return screen.findByRole("dialog", { name: "Editar rol" });
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }

describe("Roles page", () => {
  it("lists real rows with count/summary, pages and page size from the shared query", async () => {
    render(<RolesPage />);
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
    render(<RolesPage />);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "venta" } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(api.listRoles).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.listRoles).toHaveBeenLastCalledWith(expect.objectContaining({ q: "venta", offset: 0 }));
  });
  it("validates fields in Spanish, marks invalid and focuses first; no API writes", async () => {
    render(<RolesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByLabelText("Código", { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(screen.getByLabelText("Código", { exact: true })).toHaveFocus());
    expect(screen.getByText(/Usa de 2 a 50 caracteres/)).toBeVisible();
    expect(api.createRole).not.toHaveBeenCalled();
  });
  it("creates a role and assigns selected permissions after creation", async () => {
    render(<RolesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledExactlyOnceWith({ codigo: "VENTAS", nombre: "Ventas", descripcion: "" });
    expect(api.assignPermission).toHaveBeenCalledExactlyOnceWith("r1", "p3");
    expect(screen.getByText("Rol creado correctamente.")).toBeVisible();
    expect(api.listRoles).toHaveBeenCalledTimes(2);
  });
  it("keeps duplicate 409 message in drawer without changing permissions", async () => {
    vi.mocked(api.createRole).mockRejectedValue(new ApiError(409, "Ya existe un rol con ese código", {}));
    render(<RolesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
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
    await userEvent.click(screen.getByRole("checkbox", { name: "Editar ventas" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo asignar el permiso Ver caja. Conflicto de permiso");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(api.listRoles).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.assignPermission).mock.calls).toEqual([["r1", "p2"], ["r1", "p3"], ["r1", "p3"]]);
  });
  it("retains a created role after assignment failure and never creates it twice on retry", async () => {
    vi.mocked(api.assignPermission).mockRejectedValueOnce(new ApiError(403, "Forbidden", {})).mockResolvedValue(role);
    render(<RolesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El rol se creó y se conserva.");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo asignar el permiso Ver caja.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledTimes(1);
    expect(api.updateRole).not.toHaveBeenCalled();
  });
  it("protects all system role deletions and locks ADMINISTRADOR status/permissions", async () => {
    vi.mocked(api.listRoles).mockResolvedValue({ items: ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION"].map((codigo, i) => ({ ...role, id: String(i), codigo, nombre: codigo })), total: 3 });
    render(<RolesPage />);
    await screen.findByRole("button", { name: "Editar ADMINISTRADOR" });
    for (const code of ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION"]) expect(screen.getByRole("button", { name: `Eliminar ${code}` })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Editar ADMINISTRADOR" }));
    expect(screen.getByLabelText("Estado", { exact: true })).toBeDisabled();
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
    render(<RolesPage />);
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
    render(<RolesPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes autorización para administrar roles.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay roles")).toBeVisible();
  });
  it("keeps metadata errors open and does not start permission mutations", async () => {
    vi.mocked(api.updateRole).mockRejectedValue(new ApiError(422, "invalid", {}));
    await openEdit();
    change("Nombre", "Comercial");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Ver caja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo revocar el permiso Ver ventas. El rol o permiso ya no existe.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(api.updateRole).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.revokePermission).toHaveBeenCalledTimes(2);
  });
  it("requires a complete catalog, retries loading and preserves unsaved input", async () => {
    vi.mocked(options.loadPermissionOptions).mockRejectedValueOnce(new ApiError(401, "expired", {})).mockResolvedValue(catalog);
    render(<RolesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));
    change("Código", "VENTAS"); change("Nombre", "Ventas");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo de permisos. Sesión expirada.");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(api.createRole).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar catálogo" }));
    expect(await screen.findByRole("checkbox", { name: "Ver caja" })).not.toBeChecked();
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveValue("Ventas");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createRole).toHaveBeenCalledTimes(1);
  });
  it("locks controls and cancellation while a save is pending", async () => {
    let resolve!: (value: Role) => void;
    vi.mocked(api.updateRole).mockImplementation(() => new Promise<Role>(done => { resolve = done; }));
    await openEdit();
    await screen.findByRole("checkbox", { name: "Ver caja" });
    change("Nombre", "Comercial");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText("Nombre", { exact: true })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => resolve({ ...role, nombre: "Comercial" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateRole).toHaveBeenCalledTimes(1);
  });
  it("does not write anything on unchanged save or cancel", async () => {
    await openEdit();
    await screen.findByRole("checkbox", { name: "Ver ventas" });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
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
