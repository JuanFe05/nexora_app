// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import * as api from "../api/permissions-api";
import PermissionsPage from "./permissions-page";

vi.mock("../api/permissions-api", async importOriginal => ({ ...await importOriginal<typeof api>(), listPermissions: vi.fn(), createPermission: vi.fn(), updatePermission: vi.fn(), deletePermission: vi.fn() }));
const permission = { id: "p1", codigo: "identity.users.view", nombre: "Ver usuarios", modulo: "identity", descripcion: "Consultar usuarios" };
beforeEach(() => {
  vi.mocked(api.listPermissions).mockResolvedValue({ items: [permission], total: 21 });
  vi.mocked(api.createPermission).mockResolvedValue(permission);
  vi.mocked(api.updatePermission).mockResolvedValue(permission);
  vi.mocked(api.deletePermission).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });
async function loaded() { render(<PermissionsPage />); await screen.findByRole("cell", { name: permission.codigo }); }
async function createForm() {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo permiso" }));
  fireEvent.change(screen.getByLabelText(/^Código/), { target: { value: "identity.users.view" } });
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Ver usuarios" } });
  fireEvent.change(screen.getByLabelText(/^Módulo/), { target: { value: "identity" } });
}

describe("Permisos", () => {
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
    fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: "25" } });
    await waitFor(() => expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 0 })));
  });
  it("debounces search for 300ms", async () => {
    vi.useFakeTimers();
    render(<PermissionsPage />);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "identity" } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.listPermissions).toHaveBeenLastCalledWith(expect.objectContaining({ q: "identity", offset: 0 }));
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
  it("creates a permission, closes the drawer, reloads and announces success", async () => {
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
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toHaveTextContent(message);
    expect(api.listPermissions).toHaveBeenCalledTimes(1);
  });
  it("shows empty catalog and search-empty states", async () => {
    vi.mocked(api.listPermissions).mockResolvedValue({ items: [], total: 0 });
    render(<PermissionsPage />);
    expect(await screen.findByText("No hay permisos")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nadie" } });
    expect(await screen.findByText("No se encontraron resultados")).toBeVisible();
  });
  it("shows safe load errors and supports retry", async () => {
    vi.mocked(api.listPermissions).mockRejectedValueOnce(new ApiError(403, "Forbidden", null));
    render(<PermissionsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes autorización para administrar permisos.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("cell", { name: permission.codigo })).toBeVisible();
  });
});
