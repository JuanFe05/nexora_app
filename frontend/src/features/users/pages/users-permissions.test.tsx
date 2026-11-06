// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS as P } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";
import { ApiError } from "@/lib/http/api-error";
import * as api from "../api/users-api";
import { loadRoleOptions } from "../api/role-options";
import type { User } from "../types";
import UsersPage from "./users-page";

vi.mock("@/features/auth/use-auth", () => ({ useAuth: vi.fn() }));
vi.mock("../api/users-api", () => ({ listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(), assignUserRole: vi.fn(), revokeUserRole: vi.fn() }));
vi.mock("../api/role-options", () => ({ loadRoleOptions: vi.fn() }));
const ana: User = { id: "u", nombre_usuario: "ana", correo: "ana@example.org", primer_nombre: "Ana", primer_apellido: "Sol", segundo_nombre: null, segundo_apellido: null, numero_telefono: null, estado: "activo", roles: [] };
function permissions(codes: string[]) {
  vi.mocked(useAuth).mockReturnValue({ hasPermission: (code: string) => codes.includes(code) } as ReturnType<typeof useAuth>);
}
beforeEach(() => {
  vi.resetAllMocks();
  permissions(Object.values(P));
  vi.mocked(api.listUsers).mockResolvedValue({ items: [ana], total: 1 });
  vi.mocked(api.createUser).mockResolvedValue(ana);
  vi.mocked(api.updateUser).mockResolvedValue(ana);
  vi.mocked(api.assignUserRole).mockResolvedValue(ana);
  vi.mocked(loadRoleOptions).mockResolvedValue([{ id: "billing", codigo: "FACTURACION", nombre: "Facturación" }]);
});
afterEach(cleanup);
const matrix = [
  { name: "only view", codes: [P.usersView] },
  { name: "create", codes: [P.usersView, P.usersCreate] },
  { name: "update", codes: [P.usersView, P.usersUpdate] },
  { name: "deactivate", codes: [P.usersView, P.usersDeactivate] },
  { name: "delete only", codes: [P.usersView, P.usersDelete] },
  { name: "assign without catalog", codes: [P.usersView, P.usersAssignRoles] },
  { name: "assign with catalog", codes: [P.usersView, P.usersAssignRoles, P.rolesView] },
  { name: "update and deactivate without assignment", codes: [P.usersView, P.usersUpdate, P.usersDeactivate] },
  { name: "update and assign without catalog", codes: [P.usersView, P.usersUpdate, P.usersAssignRoles] },
  { name: "all", codes: Object.values(P) },
  { name: "no mutation permissions", codes: [P.usersView, P.rolesView] },
];
describe("independent user permissions", () => {
  it.each(matrix)("$name: actions, field access and exact mutations", async ({ codes }) => {
    permissions(codes);
    render(<UsersPage />);
    await screen.findByText("Ana Sol");
    const has = (code: string) => codes.includes(code as typeof codes[number]);
    expect(!!screen.queryByRole("button", { name: "Nuevo usuario" })).toBe(has(P.usersCreate));
    expect(!!screen.queryByRole("button", { name: "Eliminar ana" })).toBe(has(P.usersDelete));
    const editable = has(P.usersUpdate) || has(P.usersDeactivate) || has(P.usersAssignRoles);
    expect(!!screen.queryByRole("button", { name: "Editar ana" })).toBe(editable);
    if (!editable) {
      expect(loadRoleOptions).not.toHaveBeenCalled();
      expect(api.updateUser).not.toHaveBeenCalled();
      return;
    }
    await userEvent.click(screen.getByRole("button", { name: "Editar ana" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    const personal = screen.getByLabelText(/^Primer nombre/);
    expect(personal).toHaveProperty("readOnly", !has(P.usersUpdate));
    const status = screen.getByRole("combobox", { name: /^Estado/ });
    expect(status).toHaveProperty("disabled", !has(P.usersDeactivate));
    // Synthetic changes also prove that unauthorized values cannot leak into a PATCH.
    fireEvent.change(personal, { target: { value: "Luz" } });
    fireEvent.change(status, { target: { value: "inactivo" } });
    const canRoles = has(P.usersAssignRoles) && has(P.rolesView);
    if (canRoles) {
      await userEvent.click(await screen.findByRole("checkbox", { name: /Facturación/ }));
      expect(loadRoleOptions).toHaveBeenCalledTimes(1);
    } else {
      expect(loadRoleOptions).not.toHaveBeenCalled();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      if (has(P.usersAssignRoles)) {
        expect(screen.getByText(/Necesitas el permiso identity.roles.view/)).toBeVisible();
        expect(screen.getByRole("group", { name: "Roles" })).toBeDisabled();
      } else expect(screen.queryByRole("group", { name: "Roles" })).not.toBeInTheDocument();
    }
    if (has(P.usersUpdate) || has(P.usersDeactivate) || canRoles) {
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const body = { ...(has(P.usersUpdate) ? { primer_nombre: "Luz" } : {}), ...(has(P.usersDeactivate) ? { estado: "inactivo" } : {}) };
      if (Object.keys(body).length) expect(api.updateUser).toHaveBeenCalledExactlyOnceWith("u", body);
      else expect(api.updateUser).not.toHaveBeenCalled();
      if (canRoles) expect(api.assignUserRole).toHaveBeenCalledExactlyOnceWith("u", "billing");
      else expect(api.assignUserRole).not.toHaveBeenCalled();
      expect(api.revokeUserRole).not.toHaveBeenCalled();
    } else {
      expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
      // There is a dedicated close footer as well as the dialog's X.
      await userEvent.click(screen.getAllByRole("button", { name: "Cerrar" }).at(-1)!);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(api.updateUser).not.toHaveBeenCalled();
      expect(api.assignUserRole).not.toHaveBeenCalled();
    }
  });
  it.each([{ codes: [] }, { codes: [P.usersAssignRoles] }, { codes: [P.rolesView] }, { codes: [P.usersAssignRoles, P.rolesView] }])("create roles require both permissions: $codes", async ({ codes }) => {
    permissions([P.usersView, P.usersCreate, ...codes]);
    render(<UsersPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    const canRoles = codes.includes(P.usersAssignRoles) && codes.includes(P.rolesView);
    if (canRoles) await userEvent.click(await screen.findByRole("checkbox", { name: /Facturación/ }));
    else expect(screen.queryByRole("group", { name: "Roles" })).not.toBeInTheDocument();
    for (const [label, value] of [["Nombre de usuario", "nueva"], ["Correo", "nueva@example.org"], ["Primer nombre", "Nueva"], ["Primer apellido", "Sol"], ["Contraseña", "123456789012"]]) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createUser).toHaveBeenCalledExactlyOnceWith({ nombre_usuario: "nueva", correo: "nueva@example.org", primer_nombre: "Nueva", primer_apellido: "Sol", contrasena: "123456789012" });
    if (canRoles) expect(api.assignUserRole).toHaveBeenCalledExactlyOnceWith("u", "billing");
    else { expect(loadRoleOptions).not.toHaveBeenCalled(); expect(api.assignUserRole).not.toHaveBeenCalled(); }
    expect(api.updateUser).not.toHaveBeenCalled();
  });
  it("preserves roles returned by creation instead of revoking server defaults", async () => {
    vi.mocked(api.createUser).mockResolvedValue({ ...ana, roles: ["FACTURACION"] });
    render(<UsersPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await screen.findByRole("checkbox", { name: /Facturación/ });
    for (const [label, value] of [["Nombre de usuario", "nueva"], ["Correo", "nueva@example.org"], ["Primer nombre", "Nueva"], ["Primer apellido", "Sol"], ["Contraseña", "123456789012"]]) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createUser).toHaveBeenCalledTimes(1);
    expect(api.assignUserRole).not.toHaveBeenCalled();
    expect(api.revokeUserRole).not.toHaveBeenCalled();
  });
  it("delete alone confirms and deletes without implying other mutations", async () => {
    permissions([P.usersView, P.usersDelete]);
    vi.mocked(api.deleteUser).mockResolvedValue(undefined);
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar ana" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("ana");
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith("u");
    expect(api.createUser).not.toHaveBeenCalled();
    expect(api.updateUser).not.toHaveBeenCalled();
    expect(loadRoleOptions).not.toHaveBeenCalled();
  });
  it("retries role assignment after partial creation without creating twice or requiring the cleared password", async () => {
    vi.mocked(api.assignUserRole).mockRejectedValueOnce(new ApiError(403, "No puedes asignar este rol.", null)).mockResolvedValue(ana);
    permissions([P.usersView, P.usersCreate, P.usersAssignRoles, P.rolesView]);
    render(<UsersPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Facturación/ }));
    for (const [label, value] of [["Nombre de usuario", "nueva"], ["Correo", "nueva@example.org"], ["Primer nombre", "Nueva"], ["Primer apellido", "Sol"], ["Contraseña", "123456789012"]]) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    }
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cambios ya aplicados: crear usuario.");
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createUser).toHaveBeenCalledTimes(1);
    expect(api.assignUserRole).toHaveBeenCalledTimes(2);
    expect(api.updateUser).not.toHaveBeenCalled();
  });
  it("skips all mutations when nothing editable changed", async () => {
    permissions([P.usersView, P.usersUpdate]);
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.updateUser).not.toHaveBeenCalled();
    expect(api.assignUserRole).not.toHaveBeenCalled();
    expect(api.revokeUserRole).not.toHaveBeenCalled();
  });
  it("shows backend 403 detail in the inline alert", async () => {
    permissions([P.usersView, P.usersUpdate]);
    vi.mocked(api.updateUser).mockRejectedValue(new ApiError(403, "No puedes modificar este usuario protegido.", null));
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
    fireEvent.change(screen.getByLabelText(/^Primer nombre/), { target: { value: "Luz" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No puedes modificar este usuario protegido.");
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
describe("user FormDialog", () => {
  it("keeps the long form and full role catalog in the constrained scrolling body", async () => {
    vi.mocked(loadRoleOptions).mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ id: String(i), codigo: `R${i}`, nombre: `Rol ${i}` })));
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
    const lastRole = await screen.findByRole("checkbox", { name: "Rol 99 (R99)" });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("grid-rows-[auto_minmax(0,1fr)_auto]", "max-h-[calc(100dvh-2rem)]");
    expect(dialog.querySelector(".overflow-y-auto")).toContainElement(lastRole);
    expect(dialog.querySelector(".overflow-y-auto")).toContainElement(screen.getByLabelText(/^Nombre de usuario/));
    expect(dialog.querySelector(".overflow-y-auto")).not.toContainElement(screen.getByRole("button", { name: "Guardar" }));
  });
  it.each(["Escape", "Cancelar", "Cerrar"])("closes with %s without saving", async close => {
    render(<UsersPage />);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-hidden");
    expect(dialog.querySelector(".overflow-y-auto")).toContainElement(screen.getByLabelText(/^Contraseña/));
    if (close === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(screen.getByRole("button", { name: close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createUser).not.toHaveBeenCalled();
  });
  it("blocks Escape, cancel and X during save", async () => {
    let resolve!: (value: User) => void;
    vi.mocked(api.updateUser).mockReturnValue(new Promise<User>(done => { resolve = done; }));
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
    await screen.findByRole("checkbox", { name: /Facturación/ });
    fireEvent.change(screen.getByLabelText(/^Primer nombre/), { target: { value: "Luz" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    resolve(ana);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
