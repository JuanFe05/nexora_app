// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import * as api from "../api/profile-api";
import ProfilePage from "./profile-page";

vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "1", correo: "ana@example.test" }, roles: [] }) }));
vi.mock("../api/profile-api", async (importOriginal) => ({ ...await importOriginal<typeof api>(), getProfile: vi.fn(), updateProfile: vi.fn(), changePassword: vi.fn() }));
const profile = { id: "1", nombre_usuario: "ana", correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null, estado: "ACTIVO", roles: ["ESTADISTICA", "FACTURACION"] };
const current = () => screen.getByLabelText(/^Contraseña actual/);
const next = () => screen.getByLabelText(/^Nueva contraseña/);
const confirmation = () => screen.getByLabelText(/^Confirmar contraseña/);
const save = () => screen.getByRole("button", { name: "Guardar" });
const change = save;
async function loaded() { render(<ToastProvider><ProfilePage /></ToastProvider>); await screen.findByRole("heading", { name: "Información personal" }); }
async function editProfile(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("button", { name: "Editar" })); await screen.findByRole("dialog", { name: "Editar información personal" }); }
async function editPassword(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("button", { name: "Cambiar contraseña" })); await screen.findByRole("dialog", { name: "Cambiar contraseña" }); }
async function closed() { await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(document.querySelectorAll("input")).toHaveLength(0); }
async function fillPasswords(user: ReturnType<typeof userEvent.setup>, actual = "actual-privada", nueva = "Nueva-privada-123", confirm = nueva) {
  await user.type(current(), actual); await user.type(next(), nueva); await user.type(confirmation(), confirm);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.getProfile).mockResolvedValue(profile); vi.mocked(api.changePassword).mockResolvedValue(undefined); });
afterEach(cleanup);

describe("perfil propio", () => {
  it("carga datos y roles sin inputs; usuario solo lectura y guardar inactivo al editar", async () => {
    const user = userEvent.setup(); await loaded();
    expect(screen.getByRole("heading", { name: "Perfil de usuario" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Seguridad" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Roles asignados" })).toHaveTextContent("ESTADISTICA");
    expect(screen.getByText("ESTADISTICA")).toBeInTheDocument();
    expect(screen.getByText("FACTURACION")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelectorAll("input")).toHaveLength(0);
    const card = screen.getByRole("heading", { name: "Información personal" }).closest('[data-slot="card"]') as HTMLElement;
    for (const value of ["ana", "Ana", "Pérez", profile.correo]) expect(within(card).getByText(value)).toBeInTheDocument();
    for (const label of ["Nombre de usuario", "Primer nombre", "Segundo nombre", "Primer apellido", "Segundo apellido", "Correo electrónico", "Teléfono"]) expect(within(card).getByText(label)).toBeInTheDocument();
    expect(within(card).getAllByText("—")).toHaveLength(3);
    await editProfile(user);
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/^Correo electrónico/)).toHaveValue(profile.correo);
    expect(save()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });
  it("muestra guion para opcionales vacíos", async () => {
    vi.mocked(api.getProfile).mockResolvedValue({ ...profile, segundo_nombre: "", segundo_apellido: "", numero_telefono: "" });
    await loaded(); expect(screen.getAllByText("—")).toHaveLength(3);
  });
  it.each(["Cancelar", "Cerrar"])("%s descarta cambios y errores sin PATCH", async (button) => {
    const user = userEvent.setup(); await loaded(); await editProfile(user);
    await user.clear(screen.getByLabelText(/^Primer nombre/)); await user.click(save());
    expect(screen.getByLabelText(/^Primer nombre/)).toHaveAccessibleDescription("Este campo es obligatorio.");
    await user.click(screen.getByRole("button", { name: button })); await closed();
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
    await editProfile(user);
    expect(screen.getByLabelText(/^Primer nombre/)).toHaveValue("Ana");
    expect(screen.getByLabelText(/^Primer nombre/)).toHaveAttribute("aria-invalid", "false");
    expect(save()).toBeDisabled(); expect(api.updateProfile).not.toHaveBeenCalled();
  });
  it("muestra carga y error con reintento", async () => {
    vi.mocked(api.getProfile).mockRejectedValueOnce(new ApiError(0, "red", null));
    render(<ToastProvider><ProfilePage /></ToastProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando perfil");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Información personal" })).toBeInTheDocument();
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
  it("envía solo diferencias, bloquea durante PATCH, cierra y sincroniza la tarjeta", async () => {
    let resolve!: (value: typeof profile) => void;
    vi.mocked(api.updateProfile).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const user = userEvent.setup(); await loaded(); await editProfile(user);
    const email = screen.getByLabelText(/^Correo electrónico/);
    await user.clear(email); await user.type(email, "nueva@example.test");
    expect(save()).toBeEnabled(); await user.click(save());
    expect(api.updateProfile).toHaveBeenCalledExactlyOnceWith(profile, expect.objectContaining({ correo: "nueva@example.test" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cerrar" })); await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(email).toBeDisabled();
    await act(async () => { resolve({ ...profile, correo: "nueva@example.test" }); });
    expect(await within(screen.getByRole("region", { name: "Notificaciones" })).findByRole("status")).toHaveTextContent("Datos actualizados");
    await closed(); expect(screen.getByText("nueva@example.test")).toBeInTheDocument();
    await editProfile(user);
    expect(screen.getByRole("form", { name: "Datos personales" })).not.toHaveTextContent("Datos actualizados");
    expect(screen.getByLabelText(/^Correo electrónico/)).toHaveValue("nueva@example.test"); expect(save()).toBeDisabled();
  });
  it.each([409, 422])("presenta error %s sin perder datos y permite corregir", async (status) => {
    const detail = status === 409 ? "El correo ya está en uso" : "Correo inválido";
    vi.mocked(api.updateProfile).mockRejectedValue(new ApiError(status, detail, status === 422 ? { detail: [{ loc: ["body", "correo"], msg: detail }] } : null));
    const user = userEvent.setup(); await loaded(); await editProfile(user);
    const email = screen.getByLabelText(/^Correo electrónico/);
    await user.clear(email); await user.type(email, "otra@example.test"); await user.click(save());
    expect((await screen.findAllByText(detail)).length).toBeGreaterThan(0);
    expect(email).toHaveValue("otra@example.test"); expect(save()).toBeEnabled();
    if (status === 422) { expect(email).toHaveAccessibleDescription(detail); expect(email).toHaveFocus(); }
  });
  it("valida campos requeridos, formato, opcionales vaciados y enfoca el primer inválido sin PATCH", async () => {
    vi.mocked(api.getProfile).mockResolvedValue({ ...profile, segundo_nombre: "María" });
    const user = userEvent.setup(); await loaded(); await editProfile(user);
    const first = screen.getByLabelText(/^Primer nombre/);
    await user.clear(first); await user.clear(screen.getByLabelText(/^Segundo nombre/));
    await user.clear(screen.getByLabelText(/^Correo electrónico/)); await user.type(screen.getByLabelText(/^Correo electrónico/), "invalido");
    await user.click(save());
    expect(first).toHaveFocus(); expect(first).toHaveAccessibleDescription("Este campo es obligatorio.");
    expect(screen.getByLabelText(/^Correo electrónico/)).toHaveAccessibleDescription("Introduce un correo electrónico válido.");
    expect(screen.getByLabelText(/^Segundo nombre/)).toHaveAttribute("aria-invalid", "true");
    expect(api.updateProfile).not.toHaveBeenCalled();
  });
  it("una edición revertida no envía cambios", async () => {
    const user = userEvent.setup(); await loaded(); await editProfile(user);
    const first = screen.getByLabelText(/^Primer nombre/);
    await user.type(first, "x"); expect(save()).toBeEnabled(); await user.keyboard("{Backspace}"); expect(save()).toBeDisabled();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });
});

describe("cambio de contraseña", () => {
  it("actualiza requisitos en vivo sin serializar el secreto y reinicia al cerrar", async () => {
    const user = userEvent.setup(); await loaded(); await editPassword(user);
    const list = screen.getByRole("list", { name: "Requisitos de contraseña" });
    expect(within(list).getAllByText("pendiente")).toHaveLength(5);
    await user.type(next(), "Abc123!x");
    expect(within(list).getAllByText("cumplido")).toHaveLength(5);
    expect(next()).toHaveAccessibleDescription(/Entre 6 y 24 caracteres/);
    expect(next()).not.toHaveAttribute("value");
    expect(document.body.innerHTML).not.toContain("Abc123!x");
    await user.clear(next()); await user.type(next(), "abc12!");
    expect(within(list).getAllByText("cumplido")).toHaveLength(4);
    expect(within(list).getAllByText("pendiente")).toHaveLength(1);
    await user.clear(next());
    expect(within(list).getAllByText("pendiente")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Cancelar" })); await closed();
    await editPassword(user);
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("pendiente")).toHaveLength(5);
    expect(api.changePassword).not.toHaveBeenCalled();
  });
  it("exige los tres campos con mensajes accesibles y foco", async () => {
    const user = userEvent.setup(); await loaded(); await editPassword(user); await user.click(change());
    expect(current()).toHaveFocus();
    for (const field of [current(), next(), confirmation()]) {
      expect(field).toBeRequired(); expect(field).toHaveAttribute("aria-invalid", "true");
      if (field === next()) expect(field).toHaveAccessibleDescription("Entre 6 y 24 caracteres pendiente Al menos una letra mayúscula pendiente Al menos una letra minúscula pendiente Al menos un número pendiente Al menos un carácter especial (@, #, $, %, &, !…) pendiente 0 de 5 requisitos cumplidos. Este campo es obligatorio.");
      else expect(field).toHaveAccessibleDescription("Este campo es obligatorio.");
    }
    expect(api.changePassword).not.toHaveBeenCalled();
  });
  it.each(["Cancelar", "Cerrar"])("%s descarta secretos y visibilidad", async (button) => {
    const user = userEvent.setup(); await loaded(); await editPassword(user); await fillPasswords(user);
    await user.click(screen.getByRole("button", { name: "Mostrar nueva contraseña" }));
    await user.click(screen.getByRole("button", { name: button })); await closed();
    await editPassword(user);
    for (const field of [current(), next(), confirmation()]) { expect(field).toHaveValue(""); expect(field).toHaveAttribute("type", "password"); expect(field).toHaveAttribute("aria-invalid", "false"); }
    expect(api.changePassword).not.toHaveBeenCalled(); expect(document.body.innerHTML).not.toContain("privada");
  });
  it.each([
    ["actual-privada", "corta", "corta", "La contraseña debe tener entre 6 y 24 caracteres, al menos una letra mayúscula, una minúscula, un número y un carácter especial."],
    ["actual-privada", "Nueva-privada-123", "distinta", "Las contraseñas no coinciden."],
    ["Misma-privada-123", "Misma-privada-123", "Misma-privada-123", "La contraseña nueva debe ser diferente de la actual."],
  ])("rechaza longitud, discrepancia o igualdad sin enviar", async (actual, nueva, confirm, message) => {
    const user = userEvent.setup(); await loaded(); await editPassword(user); await fillPasswords(user, actual, nueva, confirm); await user.click(change());
    expect(screen.getByText(message)).toHaveAttribute("role", "alert"); expect(api.changePassword).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(actual); expect(document.body.textContent).not.toContain(nueva);
  });
  it("400 marca solo actual, limpia secretos y nunca reproduce el detalle del error", async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new ApiError(400, "actual-privada", null));
    const user = userEvent.setup(); await loaded(); await editPassword(user); await fillPasswords(user); await user.click(change());
    await waitFor(() => expect(current()).toHaveAccessibleDescription("La contraseña actual es incorrecta."));
    expect(current()).toHaveFocus(); expect(current()).toHaveAttribute("aria-invalid", "true");
    expect(next()).toHaveAttribute("aria-invalid", "false"); expect(confirmation()).toHaveAttribute("aria-invalid", "false");
    for (const field of [current(), next(), confirmation()]) expect(field).toHaveValue("");
    expect(document.body.innerHTML).not.toContain("actual-privada");
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("pendiente")).toHaveLength(5);
  });
  it("429 anuncia Retry-After sin marcar campos ni revelar secretos", async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new ApiError(429, "Nueva-privada-123", null, "42"));
    const user = userEvent.setup(); await loaded(); await editPassword(user); await fillPasswords(user); await user.click(change());
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Intenta de nuevo en 42 segundos.");
    for (const field of [current(), next(), confirmation()]) { expect(field).toHaveAttribute("aria-invalid", "false"); expect(field).toHaveValue(""); }
    expect(document.body.innerHTML).not.toContain("Nueva-privada-123");
  });
  it("204 bloquea envío concurrente, limpia claves inmediatamente, cierra y conserva sesión", async () => {
    let resolve!: () => void;
    vi.mocked(api.changePassword).mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    const user = userEvent.setup(); await loaded(); await editPassword(user); await fillPasswords(user);
    await user.click(screen.getByRole("button", { name: "Mostrar nueva contraseña" })); await user.click(change());
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    for (const field of [current(), next(), confirmation()]) { expect(field).toHaveValue(""); expect(field).toHaveAttribute("type", "password"); }
    await user.click(screen.getByRole("button", { name: "Actualizando…" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" })); await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("pendiente")).toHaveLength(5);
    expect(api.changePassword).toHaveBeenCalledExactlyOnceWith({ contrasena_actual: "actual-privada", contrasena_nueva: "Nueva-privada-123" });
    await act(async () => { resolve(); });
    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña actualizada. Se cerraron tus otras sesiones.");
    await closed(); await editPassword(user);
    for (const field of [current(), next(), confirmation()]) { expect(field).toHaveValue(""); expect(field).toHaveAttribute("type", "password"); }
    expect(change()).toBeEnabled(); expect(api.getProfile).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).not.toContain("privada");
  });
  it("cada clave alterna visibilidad con nombre y estado accesibles sin enviarla", async () => {
    const user = userEvent.setup(); await loaded(); await editPassword(user);
    for (const [field, label] of [[current(), "contraseña actual"], [next(), "nueva contraseña"], [confirmation(), "confirmación de contraseña"]] as const) {
      const button = screen.getByRole("button", { name: `Mostrar ${label}` });
      expect(button).toHaveAttribute("aria-pressed", "false"); await user.click(button);
      expect(field).toHaveAttribute("type", "text"); expect(button).toHaveAttribute("aria-pressed", "true");
      await user.click(within(field.closest('[data-slot="input-group"]') as HTMLElement).getByRole("button"));
      expect(field).toHaveAttribute("type", "password");
    }
    expect(api.changePassword).not.toHaveBeenCalled();
  });
});
