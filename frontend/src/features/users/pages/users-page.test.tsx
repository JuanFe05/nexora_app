// @vitest-environment jsdom
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { PERMISSIONS as P } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";
import * as api from "../api/users-api";
import { loadRoleOptions } from "../api/role-options";
import type { User } from "../types";
import UsersPage from "./users-page";

vi.mock("../api/users-api", () => ({ listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(), assignUserRole: vi.fn(), revokeUserRole: vi.fn() }));
vi.mock("../api/role-options", () => ({ loadRoleOptions: vi.fn() }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: vi.fn() }));
function permissions(codes: string[]) {
  vi.mocked(useAuth).mockReturnValue({ hasPermission: (code: string) => codes.includes(code) } as ReturnType<typeof useAuth>);
}
const ana: User = { id: "u", nombre_usuario: "ana", correo: "ana@example.org", primer_nombre: "Ana", primer_apellido: "Sol", segundo_nombre: null, segundo_apellido: null, numero_telefono: null, estado: "activo", roles: ["ADMINISTRADOR"] };
beforeEach(() => {
  vi.resetAllMocks();
  permissions(Object.values(P));
  vi.mocked(api.listUsers).mockResolvedValue({ items: [ana], total: 101 });
  vi.mocked(api.createUser).mockResolvedValue(ana);
  vi.mocked(api.updateUser).mockResolvedValue({ ...ana, primer_nombre: "Luz" });
  vi.mocked(api.assignUserRole).mockResolvedValue(ana);
  vi.mocked(api.deleteUser).mockResolvedValue(undefined);
  vi.mocked(api.revokeUserRole).mockResolvedValue(undefined);
  vi.mocked(loadRoleOptions).mockResolvedValue([{ id: "admin", codigo: "ADMINISTRADOR", nombre: "Administrador" }, { id: "billing", codigo: "FACTURACION", nombre: "Facturación" }]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function openEdit() {
  render(<ToastProvider><UsersPage /></ToastProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
  return screen.findByRole("checkbox", { name: /Facturación/ });
}
async function fillCreate() {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  for (const [label, value] of [["Nombre de usuario", "nueva"], ["Correo", "nueva@example.org"], ["Primer nombre", "Nueva"], ["Primer apellido", "Sol"], ["Contraseña", "123456789012"]]) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
  }
}
describe("Usuarios", () => {
  it("renders real rows, role/status badges, full name and named icon actions", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    expect(await screen.findByRole("button", { name: "Editar ana" })).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Usuarios" })).toHaveLength(1);
    const table = screen.getByRole("table", { name: "Usuarios" });
    expect(within(table).getByText("Ana Sol")).toBeVisible();
    expect(within(table).getByText("ADMINISTRADOR")).toBeVisible();
    expect(within(table).getByText("Activo")).toBeVisible();
    expect(screen.getByRole("button", { name: "Eliminar ana" })).toBeVisible();
    expect(screen.getByText("Mostrando 1 a 10 de 101 registros")).toBeVisible();
  });
  it("debounces search and forwards server pagination and page size", async () => {
    vi.useFakeTimers();
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ana" } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(api.listUsers).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ana", limit: 10, offset: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await act(async () => {});
    expect(api.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: "25" } });
    await act(async () => {});
    expect(api.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25, offset: 0, q: "ana" }));
  });
  it("validates fields accessibly and focuses the first invalid field without a request", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByLabelText(/^Nombre de usuario/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Nombre de usuario/)).toHaveFocus();
    expect(screen.getAllByText("Este campo es obligatorio.")).toHaveLength(4);
    expect(api.createUser).not.toHaveBeenCalled();
  });
  it("creates, closes and reloads with a status message", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith({ nombre_usuario: "nueva", correo: "nueva@example.org", primer_nombre: "Nueva", primer_apellido: "Sol", contrasena: "123456789012" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(screen.getByRole("region", { name: "Notificaciones" })).getByText("Usuario creado correctamente.").closest("[data-toast]")).toHaveAttribute("role", "status");
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });
  it("shows backend duplicate detail and clears the password on create failure", async () => {
    vi.mocked(api.createUser).mockRejectedValue(new ApiError(409, "El nombre de usuario o el correo ya estan registrados", null));
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre de usuario o el correo ya estan registrados");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue("");
  });
  it("sends one minimal PATCH followed by role diff calls", async () => {
    const billing = await openEdit();
    fireEvent.change(screen.getByLabelText(/^Primer nombre/), { target: { value: "Luz" } });
    await userEvent.click(billing);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Administrador/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.revokeUserRole).toHaveBeenCalledWith("u", "admin"));
    expect(api.updateUser).toHaveBeenCalledExactlyOnceWith("u", { primer_nombre: "Luz" });
    expect(api.assignUserRole).toHaveBeenCalledExactlyOnceWith("u", "billing");
    expect(vi.mocked(api.updateUser).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.assignUserRole).mock.invocationCallOrder[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("skips PATCH for role-only changes", async () => {
    await userEvent.click(await openEdit());
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.assignUserRole).toHaveBeenCalledWith("u", "billing"));
    expect(api.updateUser).not.toHaveBeenCalled();
  });
  it("keeps partial failure visible, reloads, and retries only unapplied changes", async () => {
    vi.mocked(api.revokeUserRole).mockRejectedValueOnce(new ApiError(409, "No se puede dejar al sistema sin un administrador activo", null));
    const billing = await openEdit();
    fireEvent.change(screen.getByLabelText(/^Primer nombre/), { target: { value: "Luz" } });
    await userEvent.click(billing);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Administrador/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo revocar el rol ADMINISTRADOR");
    expect(alert).toHaveTextContent("Cambios ya aplicados: datos personales, asignar FACTURACION.");
    expect(alert).toHaveTextContent("No se puede dejar al sistema sin un administrador activo");
    expect(screen.getByRole("dialog")).toBeVisible();
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateUser).toHaveBeenCalledTimes(1);
    expect(api.assignUserRole).toHaveBeenCalledTimes(1);
    expect(api.revokeUserRole).toHaveBeenCalledTimes(2);
  });
  it("shows 422 field messages without echoing passwords", async () => {
    vi.mocked(api.createUser).mockRejectedValue(new ApiError(422, "raw secret", { detail: [{ loc: ["body", "correo"], msg: "raw secret" }] }));
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Revisa este campo.")).toBeVisible();
    expect(screen.getByLabelText(/^Correo/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/raw secret/)).not.toBeInTheDocument();
  });
  it("requires a complete role catalog before editing and offers retry", async () => {
    vi.mocked(loadRoleOptions).mockRejectedValueOnce(new ApiError(403, "No tienes permisos para consultar roles.", null));
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(api.updateUser).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar roles" }));
    expect(await screen.findByRole("checkbox", { name: /Facturación/ })).toBeVisible();
  });
  it("cancel never deletes; confirm shows last-admin conflict and keeps the dialog open", async () => {
    vi.mocked(api.deleteUser).mockRejectedValue(new ApiError(409, "No se puede dejar al sistema sin un administrador activo", null));
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar ana" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("ana");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteUser).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar ana" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede dejar al sistema sin un administrador activo");
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });
  it("deletes and clamps a now-empty last page", async () => {
    vi.mocked(api.listUsers).mockResolvedValue({ items: [ana], total: 11 });
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await screen.findByRole("button", { name: "Eliminar ana" });
    await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar ana" }));
    vi.mocked(api.listUsers).mockResolvedValue({ items: [ana], total: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 })));
    expect(within(screen.getByRole("region", { name: "Notificaciones" })).getByText("Usuario eliminado correctamente.").closest("[data-toast]")).toHaveAttribute("role", "status");
  });
  it("shows empty state and server error with retry through DataTable", async () => {
    vi.mocked(api.listUsers).mockRejectedValueOnce(new ApiError(403, "No tienes permisos para consultar usuarios.", null)).mockResolvedValue({ items: [], total: 0 });
    render(<ToastProvider><UsersPage /></ToastProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay usuarios")).toBeVisible();
  });
});
