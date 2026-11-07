// @vitest-environment jsdom
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { PERMISSIONS } from "@/features/auth/permissions";

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn<(code: string) => boolean>() }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ hasPermission }) }));
import * as api from "../api/permissions-api";
import PermissionsPage from "./permissions-page";
import { expectAdminPage } from "../../users/pages/admin-page-test-helpers";

vi.mock("../api/permissions-api", async importOriginal => ({ ...await importOriginal<typeof api>(), listPermissions: vi.fn(), createPermission: vi.fn(), updatePermission: vi.fn(), deletePermission: vi.fn() }));
const permission = { id: "p1", codigo: "identity.users.view", nombre: "Ver usuarios", modulo: "identity", descripcion: "Consultar usuarios" };
beforeEach(() => {
  hasPermission.mockReturnValue(true);
  vi.mocked(api.listPermissions).mockResolvedValue({ items: [permission], total: 21 });
  vi.mocked(api.createPermission).mockResolvedValue(permission);
  vi.mocked(api.updatePermission).mockResolvedValue(permission);
  vi.mocked(api.deletePermission).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });
async function loaded() { render(<ToastProvider><PermissionsPage /></ToastProvider>); await screen.findByRole("cell", { name: permission.codigo }); }
async function createForm() {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo permiso" }));
  fireEvent.change(screen.getByLabelText(/^Código/), { target: { value: "identity.users.view" } });
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Ver usuarios" } });
  fireEvent.change(screen.getByLabelText(/^Módulo/), { target: { value: "identity" } });
}

describe("Permisos", () => {
  it("shares the administration structure, technical codes and text-only brand module badges", async () => {
    vi.mocked(api.listPermissions).mockResolvedValue({ items: [permission, { ...permission, id: "p2", codigo: "identity.users.edit", descripcion: null }], total: 2 });
    await loaded();
    expectAdminPage("Administración de permisos", "Permisos", "Consulta y mantén el catálogo de permisos del sistema.", ["Código", "Nombre", "Módulo", "Descripción", "Acciones"], "Nuevo permiso");
    const cells = within(screen.getByText(permission.codigo).closest("tr")!).getAllByRole("cell");
    expect(within(cells[0]).getByText(permission.codigo)).toHaveClass("font-mono");
    expect(cells[1]).toHaveTextContent(/^Ver usuarios$/);
    const badge = within(cells[2]).getByText("identity");
    expect(badge).toHaveAttribute("data-variant", "brand");
    expect(badge.querySelector("svg")).toBeNull();
    expect(cells[3]).toHaveTextContent(/^Consultar usuarios$/);
    expect(within(screen.getByText("identity.users.edit").closest("tr")!).getAllByRole("cell")[3]).toHaveTextContent(/^—$/);
  });
  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])("independent permission matrix: create=%s update=%s delete=%s", async (create, update, remove) => {
    const granted = new Set<string>([
      PERMISSIONS.permissionsView,
      ...(create ? [PERMISSIONS.permissionsCreate] : []),
      ...(update ? [PERMISSIONS.permissionsUpdate] : []),
      ...(remove ? [PERMISSIONS.permissionsDelete] : []),
    ]);
    hasPermission.mockImplementation(code => granted.has(code));
    await loaded();
    const expectPresence = (element: HTMLElement | null, present: boolean) => {
      if (present) expect(element).toBeVisible();
      else expect(element).not.toBeInTheDocument();
    };
    expectPresence(screen.queryByRole("button", { name: "Nuevo permiso" }), create);
    expectPresence(screen.queryByRole("button", { name: "Editar permiso Ver usuarios" }), update);
    expectPresence(screen.queryByRole("button", { name: "Eliminar permiso Ver usuarios" }), remove);
    expectPresence(screen.queryByRole("columnheader", { name: "Acciones" }), update || remove);
    if (create) {
      await createForm();
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(api.createPermission).toHaveBeenCalledExactlyOnceWith({ codigo: permission.codigo, nombre: permission.nombre, modulo: permission.modulo, descripcion: "" });
    } else expect(api.createPermission).not.toHaveBeenCalled();
    if (update) {
      await userEvent.click(screen.getByRole("button", { name: "Editar permiso Ver usuarios" }));
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(api.updatePermission).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Editar permiso Ver usuarios" }));
      fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Consultar" } });
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(api.updatePermission).toHaveBeenCalledExactlyOnceWith(permission, { codigo: permission.codigo, nombre: "Consultar", modulo: permission.modulo, descripcion: permission.descripcion });
    } else expect(api.updatePermission).not.toHaveBeenCalled();
    if (remove) {
      await userEvent.click(screen.getByRole("button", { name: "Eliminar permiso Ver usuarios" }));
      await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(api.deletePermission).toHaveBeenCalledExactlyOnceWith(permission.id);
    } else expect(api.deletePermission).not.toHaveBeenCalled();
    expect(api.listPermissions).toHaveBeenCalledTimes(1 + Number(create) + Number(update) + Number(remove));
  });
  it.each(["Escape", "Cancelar", "Cerrar"])("uses Dialog with Form and dismisses with %s without a mutation", async close => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Nuevo permiso" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo permiso" });
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveAccessibleDescription("Agrega un permiso al catálogo. Los campos con * son obligatorios.");
    if (close === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(within(dialog).getByRole("button", { name: close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createPermission).not.toHaveBeenCalled();
    expect(api.updatePermission).not.toHaveBeenCalled();
    expect(api.deletePermission).not.toHaveBeenCalled();
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
  });
  it.each(["create", "update"])("blocks all closing controls while %s is pending", async action => {
    let resolve!: (value: typeof permission) => void;
    const pending = new Promise<typeof permission>(done => { resolve = done; });
    if (action === "create") vi.mocked(api.createPermission).mockReturnValue(pending);
    else vi.mocked(api.updatePermission).mockReturnValue(pending);
    await loaded();
    if (action === "create") await createForm();
    else {
      await userEvent.click(screen.getByRole("button", { name: "Editar permiso Ver usuarios" }));
      fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Consultar" } });
    }
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText(/^Nombre/)).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(dialog).toBeVisible();
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(permission); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.listPermissions).toHaveBeenCalledTimes(2);
  });
  it.each(["create", "update", "delete"])("shows backend 403 detail in the %s InlineAlert without reloading", async action => {
    const error = new ApiError(403, "No tienes el permiso requerido para esta operación.", null);
    vi.mocked(api.createPermission).mockRejectedValue(error);
    vi.mocked(api.updatePermission).mockRejectedValue(error);
    vi.mocked(api.deletePermission).mockRejectedValue(error);
    await loaded();
    if (action === "create") await createForm();
    else if (action === "update") {
      await userEvent.click(screen.getByRole("button", { name: "Editar permiso Ver usuarios" }));
      fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Consultar" } });
    } else await userEvent.click(screen.getByRole("button", { name: "Eliminar permiso Ver usuarios" }));
    await userEvent.click(screen.getByRole("button", { name: action === "delete" ? "Eliminar" : "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(error.detail);
    expect(screen.getByRole(action === "delete" ? "alertdialog" : "dialog")).toBeVisible();
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
    if (action !== "delete") expect(screen.getByLabelText(/^Nombre/)).toHaveValue(action === "update" ? "Consultar" : permission.nombre);
  });
  it("lists real catalog fields with accessible edit/delete actions and paginates", async () => {
    await loaded();
    expect(screen.getByRole("table", { name: "Permisos" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "identity" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Consultar usuarios" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Editar permiso Ver usuarios" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Eliminar permiso Ver usuarios" })).toBeVisible();
    expect(screen.getByText("Mostrando 1 a 10 de 21 registros")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10, offset: 10 })));
    await screen.findByRole("cell", { name: permission.codigo });
    for (const size of [25, 50, 100, 10]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: String(size) } });
      await waitFor(() => expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ limit: size, offset: 0 })));
    }
  });
  it("debounces search for 300ms", async () => {
    vi.useFakeTimers();
    render(<ToastProvider><PermissionsPage /></ToastProvider>);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "identity" } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ q: "identity", offset: 0 }));
  });
  it("keeps permission search truncated to 100 characters before the server request", async () => {
    vi.useFakeTimers();
    render(<ToastProvider><PermissionsPage /></ToastProvider>);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "x".repeat(101) } });
    expect(screen.getByRole("searchbox")).toHaveValue("x".repeat(100));
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ q: "x".repeat(100), offset: 0 }));
    expect(api.createPermission).not.toHaveBeenCalled();
    expect(api.updatePermission).not.toHaveBeenCalled();
    expect(api.deletePermission).not.toHaveBeenCalled();
  });
  it("validates fields accessibly and focuses the first invalid input without calling the API", async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Nuevo permiso" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const code = screen.getByLabelText(/^Código/);
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code).toHaveAccessibleDescription("El código es obligatorio.");
    expect(code).toHaveFocus();
    expect(screen.getByText("El nombre es obligatorio.")).toBeVisible();
    expect(screen.getByText("El módulo es obligatorio.")).toBeVisible();
    expect(api.createPermission).not.toHaveBeenCalled();
  });
  it("creates a permission, closes the dialog, reloads and announces success", async () => {
    await loaded(); await createForm();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(api.createPermission).toHaveBeenCalledWith({ codigo: permission.codigo, nombre: permission.nombre, modulo: permission.modulo, descripcion: "" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Permiso creado correctamente.")).toBeVisible();
    expect(api.listPermissions).toHaveBeenCalledTimes(2);
  });
  it("keeps creation data and shows the backend duplicate message on 409", async () => {
    vi.mocked(api.createPermission).mockRejectedValue(new ApiError(409, "Ya existe un permiso con ese código", null));
    await loaded(); await createForm();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un permiso con ese código");
    expect(screen.getByLabelText(/^Código/)).toHaveValue(permission.codigo);
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
  });
  it("edits with immutable code and saves the values via the API module", async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Editar permiso Ver usuarios" }));
    expect(screen.getByLabelText(/^Código/)).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Consultar" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(api.updatePermission).toHaveBeenCalledWith(permission, { codigo: permission.codigo, nombre: "Consultar", modulo: permission.modulo, descripcion: permission.descripcion });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Permiso actualizado correctamente.")).toBeVisible();
  });
  it("does not mutate or reload an unchanged edit", async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Editar permiso Ver usuarios" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updatePermission).not.toHaveBeenCalled();
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
  });
  it("cancels deletion without a request, then confirms and clamps after deleting the last page", async () => {
    vi.mocked(api.listPermissions).mockResolvedValue({ items: [permission], total: 11 });
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await screen.findByRole("cell", { name: permission.codigo });
    await userEvent.click(screen.getByRole("button", { name: "Eliminar permiso Ver usuarios" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(expect.stringContaining("Ver usuarios"));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.deletePermission).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Eliminar permiso Ver usuarios" }));
    vi.mocked(api.listPermissions).mockResolvedValue({ items: [permission], total: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 })));
    expect(api.deletePermission).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Permiso eliminado correctamente.")).toBeVisible();
  });
  it.each(["No se puede eliminar un permiso del catálogo del sistema", "El permiso está asignado a roles"])("keeps confirmation open and displays 409: %s", async message => {
    vi.mocked(api.deletePermission).mockRejectedValue(new ApiError(409, message, null));
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar permiso Ver usuarios" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(await within(screen.getByRole("region", { name: "Notificaciones" })).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent(message);
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
  });
  it("shows empty catalog and search-empty states", async () => {
    vi.mocked(api.listPermissions).mockResolvedValue({ items: [], total: 0 });
    render(<ToastProvider><PermissionsPage /></ToastProvider>);
    expect(await screen.findByText("No hay permisos")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nadie" } });
    expect(await screen.findByText("No se encontraron resultados")).toBeVisible();
  });
  it("shows safe load errors and supports retry", async () => {
    vi.mocked(api.listPermissions).mockRejectedValueOnce(new ApiError(403, "Forbidden", null));
    render(<ToastProvider><PermissionsPage /></ToastProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("cell", { name: permission.codigo })).toBeVisible();
  });
});
