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
import { expectAdminPage } from "./admin-page-test-helpers";

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
afterEach(() => { cleanup(); vi.useRealTimers(); document.documentElement.classList.remove("dark"); });
async function openEdit() {
  render(<ToastProvider><UsersPage /></ToastProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "Editar ana" }));
  return screen.findByRole("checkbox", { name: /Facturación/ });
}
async function fillCreate() {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  for (const [label, value] of [["Nombre de usuario", "nueva"], ["Correo", "nueva@example.org"], ["Primer nombre", "Nueva"], ["Primer apellido", "Sol"], ["Contraseña", "Abc123!x"], ["Confirmar contraseña", "Abc123!x"]]) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
  }
}
describe("Usuarios", () => {
  it("uses a moderately wider responsive dialog and concise help", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    expect(screen.getByRole("dialog")).toHaveClass("sm:max-w-3xl", "max-w-[calc(100%-2rem)]");
    expect(screen.getByLabelText(/^Contraseña/)).toHaveAccessibleDescription(/^Entre 6 y 24 caracteres\./);
    expect(screen.queryByText(/Solo se establece al crear/)).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Requisitos de contraseña" });
    for (const text of ["Entre 6 y 24 caracteres.", "Al menos una letra mayúscula.", "Al menos una letra minúscula.", "Al menos un número.", "Al menos un carácter especial (@, #, $, %, &, !)."]) expect(within(list).getByText(text, { exact: true })).toBeVisible();
  });
  it("toggles both secrets independently and resets visibility when cleared, reset or submitted", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    for (const [field, label] of [[screen.getByLabelText(/^Contraseña/), "contraseña"], [screen.getByLabelText(/^Confirmar contraseña/), "confirmación de contraseña"]] as const) {
      const button = screen.getByRole("button", { name: `Mostrar ${label}` });
      expect(button).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(button);
      expect(field).toHaveAttribute("type", "text");
      expect(button).toHaveAccessibleName(`Ocultar ${label}`);
      expect(button).toHaveAttribute("aria-pressed", "true");
      await userEvent.clear(field);
      expect(field).toHaveAttribute("type", "password");
      expect(button).toHaveAttribute("aria-pressed", "false");
      fireEvent.change(field, { target: { value: "Abc123!x" } });
      await userEvent.click(button);
    }
    const password = screen.getByLabelText(/^Contraseña/) as HTMLInputElement;
    act(() => password.form!.reset());
    for (const field of [password, screen.getByLabelText(/^Confirmar contraseña/)]) { expect(field).toHaveValue(""); expect(field).toHaveAttribute("type", "password"); }
    expect(screen.queryByText("Las contraseñas coinciden.")).not.toBeInTheDocument();
    for (const field of [password, screen.getByLabelText(/^Confirmar contraseña/)]) fireEvent.change(field, { target: { value: "Abc123!x" } });
    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    await userEvent.click(screen.getByRole("button", { name: "Mostrar confirmación de contraseña" }));
    vi.mocked(api.createUser).mockRejectedValueOnce(new ApiError(409, "Duplicado", null));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("alert");
    for (const field of [screen.getByLabelText(/^Contraseña/), screen.getByLabelText(/^Confirmar contraseña/)]) { expect(field).toHaveValue(""); expect(field).toHaveAttribute("type", "password"); }
  });
  it("shows unmet requirements after blur or submit and computes matching live without serializing secrets", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    const password = screen.getByLabelText(/^Contraseña/);
    const confirmation = screen.getByLabelText(/^Confirmar contraseña/);
    const list = screen.getByRole("list", { name: "Requisitos de contraseña" });
    fireEvent.change(password, { target: { value: "abc12!" } });
    expect(within(list).getByText("pendiente")).toBeInTheDocument();
    fireEvent.blur(password);
    expect(within(list).getByText("incumplido").closest("li")).toHaveClass("text-red-600", "dark:text-red-400");
    fireEvent.change(password, { target: { value: "Abc123!x" } });
    fireEvent.change(confirmation, { target: { value: "Abc123!y" } });
    expect(screen.getByText("Las contraseñas no coinciden.")).toHaveClass("text-red-600", "dark:text-red-400");
    expect(confirmation).toHaveAccessibleDescription("Las contraseñas no coinciden.");
    fireEvent.change(confirmation, { target: { value: "Abc123!x" } });
    expect(screen.getByText("Las contraseñas coinciden.")).toHaveClass("text-green-600", "dark:text-green-400");
    expect(screen.queryByText("Las contraseñas no coinciden.")).not.toBeInTheDocument();
    fireEvent.change(password, { target: { value: "Abc123!y" } });
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeVisible();
    expect(document.body.innerHTML).not.toContain("Abc123!x"); expect(document.body.innerHTML).not.toContain("Abc123!y");
    expect(password).not.toHaveAttribute("value"); expect(confirmation).not.toHaveAttribute("value");
    expect(api.createUser).not.toHaveBeenCalled(); expect(api.assignUserRole).not.toHaveBeenCalled();
    act(() => (password as HTMLInputElement).form!.reset());
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(within(list).getAllByText("incumplido")).toHaveLength(5);
    expect(api.createUser).not.toHaveBeenCalled();
  });
  it("shows only role names in up to four columns and falls back to the code", async () => {
    vi.mocked(loadRoleOptions).mockResolvedValue([{ id: "admin", codigo: "ADMIN", nombre: "ADMINISTRADOR" }, { id: "fallback", codigo: "R99", nombre: "" }]);
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    const role = await screen.findByRole("checkbox", { name: "ADMINISTRADOR" });
    const fallback = screen.getByRole("checkbox", { name: "R99" });
    expect(role.closest("label")?.parentElement).toHaveClass("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "xl:grid-cols-4");
    expect(role.closest("label")).toHaveClass("items-center", "has-focus-visible:ring-3");
    expect(screen.queryByText("(ADMIN)")).not.toBeInTheDocument(); expect(screen.queryByText("(R99)")).not.toBeInTheDocument();
    await userEvent.click(fallback);
    expect(fallback).toBeChecked(); expect(fallback.closest("label")).toHaveClass("border-brand-500", "bg-brand-50");
    expect(api.assignUserRole).not.toHaveBeenCalled();
  });
  it("keeps the Nuevo usuario name with a decorative plus and groups fields", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    const button = screen.getByRole("button", { name: "Nuevo usuario" });
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await fillCreate();
    for (const section of ["Cuenta", "Datos personales", "Acceso", "Roles"]) expect(screen.getByRole("group", { name: section })).toBeVisible();
    const confirmation = screen.getByLabelText(/^Confirmar contraseña/);
    expect(confirmation).toHaveAttribute("type", "password");
    expect(confirmation).toHaveAttribute("autocomplete", "new-password");
    expect(confirmation).toBeRequired();
    expect(confirmation).not.toHaveAttribute("value");
    expect(document.body.innerHTML).not.toContain("Abc123!x");
  });
  it.each(["", "Abc123!y"])("rejects missing/mismatching confirmation (%s), describes the error and focuses it without mutations", async value => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    const confirmation = screen.getByLabelText(/^Confirmar contraseña/);
    fireEvent.change(confirmation, { target: { value } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(confirmation).toHaveAccessibleDescription("Las contraseñas no coinciden.");
    expect(confirmation).toHaveAttribute("aria-invalid", "true");
    expect(confirmation).toHaveFocus();
    expect(api.createUser).not.toHaveBeenCalled();
    expect(api.assignUserRole).not.toHaveBeenCalled();
    expect(api.listUsers).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue("Abc123!x");
  });
  it("clears both secrets immediately on submission and assigns selected role ids only", async () => {
    let resolve!: (value: User) => void;
    vi.mocked(api.createUser).mockImplementation(() => new Promise<User>(done => { resolve = done; }));
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    const billing = await screen.findByRole("checkbox", { name: /Facturación/ });
    const card = billing.closest("label");
    expect(card).toHaveClass("has-focus-visible:ring-3");
    await userEvent.click(billing);
    expect(billing).toBeChecked();
    expect(card).toHaveClass("border-brand-500", "bg-brand-50", "dark:bg-brand-500/10");
    await userEvent.click(billing);
    expect(billing).not.toBeChecked();
    await userEvent.click(billing);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue("");
    expect(screen.getByLabelText(/^Confirmar contraseña/)).toHaveValue("");
    expect(api.createUser).toHaveBeenCalledExactlyOnceWith({ nombre_usuario: "nueva", correo: "nueva@example.org", primer_nombre: "Nueva", primer_apellido: "Sol", contrasena: "Abc123!x" });
    await act(async () => resolve(ana));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.assignUserRole).toHaveBeenCalledExactlyOnceWith("u", "billing");
  });
  it("resets both uncontrolled secrets and the live requirements", async () => {
    render(<ToastProvider><UsersPage /></ToastProvider>);
    await fillCreate();
    const password = screen.getByLabelText(/^Contraseña/) as HTMLInputElement;
    const confirmation = screen.getByLabelText(/^Confirmar contraseña/);
    act(() => password.form?.reset());
    expect(password).toHaveValue("");
    expect(confirmation).toHaveValue("");
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("pendiente")).toHaveLength(5);
    expect(api.createUser).not.toHaveBeenCalled();
  });
  it("selects role cards by keyboard and retains roles outside the catalog on edit", async () => {
    vi.mocked(api.listUsers).mockResolvedValue({ items: [{ ...ana, roles: ["LEGACY"] }], total: 1 });
    const billing = await openEdit();
    expect(screen.getByText("Roles fuera del catálogo actual (se conservarán): LEGACY.")).toBeVisible();
    billing.focus();
    await userEvent.keyboard("[Space]");
    expect(billing).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.assignUserRole).toHaveBeenCalledExactlyOnceWith("u", "billing");
    expect(api.revokeUserRole).not.toHaveBeenCalled();
    expect(api.updateUser).not.toHaveBeenCalled();
    expect(api.createUser).not.toHaveBeenCalled();
  });
  it("actualiza requisitos en creación sin serializar secretos y reinicia al cerrar", async () => {
    const user = userEvent.setup(); render(<ToastProvider><UsersPage /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    const password = screen.getByLabelText(/^Contraseña/);
    const list = screen.getByRole("list", { name: "Requisitos de contraseña" });
    expect(within(list).getAllByText("pendiente")).toHaveLength(5);
    await user.type(password, "Abc123!x");
    expect(within(list).getAllByText("cumplido")).toHaveLength(5);
    expect(password).toHaveAccessibleDescription(/Entre 6 y 24 caracteres/);
    expect(password).not.toHaveAttribute("value");
    expect(document.body.innerHTML).not.toContain("Abc123!x");
    await user.clear(password); await user.type(password, "abc12!");
    expect(within(list).getAllByText("cumplido")).toHaveLength(4);
    expect(within(list).getAllByText("pendiente")).toHaveLength(1);
    await user.clear(password);
    expect(within(list).getAllByText("pendiente")).toHaveLength(5);
    await user.type(screen.getByLabelText(/^Confirmar contraseña/), "Abc123!x");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("pendiente")).toHaveLength(5);
    expect(screen.getByLabelText(/^Confirmar contraseña/)).toHaveValue("");
    expect(api.createUser).not.toHaveBeenCalled();
  });
  it.each([false, true])("shares the administration structure and renders separate names, text-only role badges and semantic status (dark=%s)", async dark => {
    document.documentElement.classList.toggle("dark", dark);
    render(<ToastProvider><UsersPage /></ToastProvider>);
    expect(await screen.findByRole("button", { name: "Editar ana" })).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Usuarios" })).toHaveLength(1);
    const table = screen.getByRole("table", { name: "Usuarios" });
    expectAdminPage("Administración de usuarios", "Usuarios", "Gestiona las cuentas, los estados y los roles de acceso.", ["Usuario", "Nombre completo", "Correo electrónico", "Roles", "Estado", "Acciones"], "Nuevo usuario");
    const row = within(table).getByText("ana").closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent(/^ana$/);
    expect(within(cells[0]).getByText("ana")).toHaveClass("font-medium");
    expect(cells[1]).toHaveTextContent(/^Ana Sol$/);
    expect(cells[2]).toHaveTextContent(/^ana@example.org$/);
    const badge = within(cells[3]).getByText("ADMINISTRADOR");
    expect(badge).toHaveAttribute("data-variant", "brand");
    expect(badge.querySelector("svg")).toBeNull();
    expect(badge.parentElement).toHaveClass("flex", "flex-wrap", "gap-1.5");
    expect(within(cells[4]).getByText("Activo")).toHaveAttribute("data-variant", "success");
    expect(screen.getByRole("button", { name: "Eliminar ana" })).toBeVisible();
    expect(screen.getByText("Mostrando 1 a 10 de 101 registros")).toBeVisible();
  });
  it("renders every nonempty name part, empty-name fallback, multiple text badges and inactive status", async () => {
    vi.mocked(api.listUsers).mockResolvedValue({ items: [
      { ...ana, segundo_nombre: "Luz", segundo_apellido: "Mar", roles: ["ADMINISTRADOR", "ESTADISTICA"] },
      { ...ana, id: "empty", nombre_usuario: "sin-nombre", primer_nombre: "", primer_apellido: "", roles: [], estado: "inactivo" },
    ], total: 2 });
    render(<ToastProvider><UsersPage /></ToastProvider>);
    const full = (await screen.findByText("Ana Luz Sol Mar")).closest("tr")!;
    const badges = full.querySelectorAll('[data-variant="brand"]');
    expect(Array.from(badges).map(badge => badge.textContent)).toEqual(["ADMINISTRADOR", "ESTADISTICA"]);
    for (const badge of badges) expect(badge.querySelector("svg")).toBeNull();
    const empty = screen.getByText("sin-nombre").closest("tr")!;
    expect(within(empty).getAllByRole("cell")[1]).toHaveTextContent(/^—$/);
    expect(within(empty).getByText("Sin roles")).toHaveClass("text-gray-500", "dark:text-gray-400");
    expect(within(empty).getByText("Inactivo")).toHaveAttribute("data-variant", "error");
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
    for (const size of [25, 50, 100, 10]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: String(size) } });
      await act(async () => {});
      expect(api.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ limit: size, offset: 0, q: "ana" }));
    }
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
    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith({ nombre_usuario: "nueva", correo: "nueva@example.org", primer_nombre: "Nueva", primer_apellido: "Sol", contrasena: "Abc123!x" }));
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
    expect(screen.getByLabelText(/^Confirmar contraseña/)).toHaveValue("");
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("pendiente")).toHaveLength(5);
  });
  it("sends one minimal PATCH followed by role diff calls", async () => {
    const billing = await openEdit();
    expect(screen.queryByRole("list", { name: "Requisitos de contraseña" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Contraseña/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Confirmar contraseña/)).not.toBeInTheDocument();
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
