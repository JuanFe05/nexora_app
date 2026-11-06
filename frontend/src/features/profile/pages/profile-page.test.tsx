// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import * as api from "../api/profile-api";
import ProfilePage from "./profile-page";

vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "1", correo: "ana@example.test" }, roles: [] }) }));
vi.mock("../api/profile-api", async (importOriginal) => ({ ...await importOriginal<typeof api>(), getProfile: vi.fn(), updateProfile: vi.fn(), changePassword: vi.fn() }));
const profile = { id: "1", nombre_usuario: "ana", correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null, estado: "ACTIVO", roles: ["ESTADISTICA", "FACTURACION"] };
const current = () => screen.getByLabelText(/^Contraseña actual/);
const next = () => screen.getByLabelText(/^Nueva contraseña/);
const confirmation = () => screen.getByLabelText(/^Confirmar contraseña/);
const save = () => screen.getByRole("button", { name: "Guardar cambios" });
const change = () => screen.getByRole("button", { name: "Actualizar contraseña" });
async function loaded() { render(<ProfilePage />); await screen.findByDisplayValue("ana"); }
async function fillPasswords(user: ReturnType<typeof userEvent.setup>, actual = "actual-privada", nueva = "nueva-privada-123", confirm = nueva) {
  await user.type(current(), actual); await user.type(next(), nueva); await user.type(confirmation(), confirm);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.getProfile).mockResolvedValue(profile); vi.mocked(api.changePassword).mockResolvedValue(undefined); });
afterEach(cleanup);

describe("perfil propio", () => {
  it("carga datos y roles de un usuario sin permiso administrador; usuario solo lectura y guardar inactivo", async () => {
    await loaded();
    expect(screen.getByRole("heading", { name: "Perfil de usuario" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de usuario")).toHaveAttribute("readonly");
    expect(screen.getByText("ESTADISTICA")).toBeInTheDocument();
    expect(screen.getByText("FACTURACION")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Correo electrónico/)).toHaveValue(profile.correo);
    expect(save()).toBeDisabled();
  });
  it("muestra carga y error con reintento", async () => {
    vi.mocked(api.getProfile).mockRejectedValueOnce(new ApiError(0, "red", null));
    render(<ProfilePage />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando perfil");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByDisplayValue("ana")).toBeInTheDocument();
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
  it("envía solo diferencias, bloquea durante PATCH y anuncia éxito", async () => {
    let resolve!: (value: typeof profile) => void;
    vi.mocked(api.updateProfile).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const user = userEvent.setup(); await loaded();
    const email = screen.getByLabelText(/^Correo electrónico/);
    await user.clear(email); await user.type(email, "nueva@example.test");
    expect(save()).toBeEnabled(); await user.click(save());
    expect(api.updateProfile).toHaveBeenCalledExactlyOnceWith(profile, expect.objectContaining({ correo: "nueva@example.test" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    await act(async () => { resolve({ ...profile, correo: "nueva@example.test" }); });
    expect(await screen.findByRole("status")).toHaveTextContent("Datos actualizados");
    expect(save()).toBeDisabled();
  });
  it.each([409, 422])("presenta error %s sin perder datos y permite corregir", async (status) => {
    const detail = status === 409 ? "El correo ya está en uso" : "Correo inválido";
    vi.mocked(api.updateProfile).mockRejectedValue(new ApiError(status, detail, status === 422 ? { detail: [{ loc: ["body", "correo"], msg: detail }] } : null));
    const user = userEvent.setup(); await loaded();
    const email = screen.getByLabelText(/^Correo electrónico/);
    await user.clear(email); await user.type(email, "otra@example.test"); await user.click(save());
    expect((await screen.findAllByText(detail)).length).toBeGreaterThan(0);
    expect(email).toHaveValue("otra@example.test"); expect(save()).toBeEnabled();
    if (status === 422) { expect(email).toHaveAccessibleDescription(detail); expect(email).toHaveFocus(); }
  });
  it("valida campos requeridos, formato, opcionales vaciados y enfoca el primer inválido sin PATCH", async () => {
    vi.mocked(api.getProfile).mockResolvedValue({ ...profile, segundo_nombre: "María" });
    const user = userEvent.setup(); await loaded();
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
    const user = userEvent.setup(); await loaded();
    const first = screen.getByLabelText(/^Primer nombre/);
    await user.type(first, "x"); expect(save()).toBeEnabled(); await user.keyboard("{Backspace}"); expect(save()).toBeDisabled();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });
});

describe("cambio de contraseña", () => {
  it("exige los tres campos con mensajes accesibles y foco", async () => {
    const user = userEvent.setup(); await loaded(); await user.click(change());
    expect(current()).toHaveFocus();
    for (const field of [current(), next(), confirmation()]) {
      expect(field).toBeRequired(); expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription("Este campo es obligatorio.");
    }
    expect(api.changePassword).not.toHaveBeenCalled();
  });
  it.each([
    ["actual-privada", "corta", "corta", "La contraseña nueva debe tener entre 12 y 128 caracteres."],
    ["actual-privada", "nueva-privada-123", "distinta", "Las contraseñas no coinciden."],
    ["misma-privada-123", "misma-privada-123", "misma-privada-123", "La contraseña nueva debe ser diferente de la actual."],
  ])("rechaza longitud, discrepancia o igualdad sin enviar", async (actual, nueva, confirm, message) => {
    const user = userEvent.setup(); await loaded(); await fillPasswords(user, actual, nueva, confirm); await user.click(change());
    expect(screen.getByText(message)).toHaveAttribute("role", "alert"); expect(api.changePassword).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(actual); expect(document.body.textContent).not.toContain(nueva);
  });
  it("400 marca solo actual, limpia secretos y nunca reproduce el detalle del error", async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new ApiError(400, "actual-privada", null));
    const user = userEvent.setup(); await loaded(); await fillPasswords(user); await user.click(change());
    await waitFor(() => expect(current()).toHaveAccessibleDescription("La contraseña actual es incorrecta."));
    expect(current()).toHaveFocus(); expect(current()).toHaveAttribute("aria-invalid", "true");
    expect(next()).toHaveAttribute("aria-invalid", "false"); expect(confirmation()).toHaveAttribute("aria-invalid", "false");
    for (const field of [current(), next(), confirmation()]) expect(field).toHaveValue("");
    expect(document.body.innerHTML).not.toContain("actual-privada");
  });
  it("429 anuncia Retry-After sin marcar campos ni revelar secretos", async () => {
    vi.mocked(api.changePassword).mockRejectedValue(new ApiError(429, "nueva-privada-123", null, "42"));
    const user = userEvent.setup(); await loaded(); await fillPasswords(user); await user.click(change());
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos. Intenta de nuevo en 42 segundos.");
    expect(current()).toHaveAttribute("aria-invalid", "false");
    expect(document.body.innerHTML).not.toContain("nueva-privada-123");
  });
  it("204 bloquea envío concurrente, limpia las tres claves, oculta visibilidad y conserva sesión", async () => {
    let resolve!: () => void;
    vi.mocked(api.changePassword).mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    const user = userEvent.setup(); await loaded(); await fillPasswords(user);
    await user.click(screen.getByRole("button", { name: "Mostrar nueva contraseña" }));
    await user.click(change());
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
    expect(api.changePassword).toHaveBeenCalledExactlyOnceWith({ contrasena_actual: "actual-privada", contrasena_nueva: "nueva-privada-123" });
    await act(async () => { resolve(); });
    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña actualizada. Se cerraron tus otras sesiones.");
    for (const field of [current(), next(), confirmation()]) { expect(field).toHaveValue(""); expect(field).toHaveAttribute("type", "password"); }
    expect(change()).toBeEnabled(); expect(api.getProfile).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).not.toContain("privada");
  });
  it("cada clave alterna visibilidad con nombre y estado accesibles sin enviarla", async () => {
    const user = userEvent.setup(); await loaded();
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
