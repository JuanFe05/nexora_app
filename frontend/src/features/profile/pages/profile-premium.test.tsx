// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import { ApiError } from "@/lib/http/api-error";
import * as api from "../api/profile-api";
import ProfilePage from "./profile-page";
const profile = { id: "1", nombre_usuario: "ana", correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null, estado: "ACTIVO", roles: ["ESTADISTICA"] };
vi.mock("../hooks/use-profile", () => ({ useProfile: () => ({ profile, loading: false, error: null, update: vi.fn(), retry: vi.fn() }) }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ logoutAll: vi.fn() }) }));
vi.mock("../api/profile-api", async (original) => ({ ...await original<typeof api>(), listSessions: vi.fn(), revokeSession: vi.fn() }));
const currentSession = { id: "current", direccion_ip: null, agente_usuario: null, fecha_creacion: "2026-01-01T12:00:00Z", fecha_ultima_actividad: "2026-01-02T13:00:00Z", fecha_vencimiento: "2026-02-01T12:00:00Z", actual: true };
const other = { ...currentSession, id: "other", direccion_ip: "192.0.2.1", agente_usuario: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36", actual: false };
let navigateOutside: (search: string) => void;
function Location() { const location = useLocation(); const navigate = useNavigate(); useEffect(() => { navigateOutside = (search) => { void navigate(search); }; }, [navigate]); return <><div aria-label="URL">{location.search}</div><button onClick={() => void navigate(-1)}>Atrás</button></>; }
function mount(search = "") { return render(<ToastProvider><MemoryRouter initialEntries={[`/${search}`]}><ProfilePage /><Location /></MemoryRouter></ToastProvider>); }
async function sessions(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("tab", { name: "Sesiones" })); return screen.findByRole("list", { name: "Sesiones activas" }); }
async function revoke(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("button", { name: "Revocar" })); return screen.findByRole("alertdialog", { name: "¿Revocar sesión?" }); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.listSessions).mockResolvedValue([currentSession, other]); vi.mocked(api.revokeSession).mockResolvedValue(undefined); });
afterEach(cleanup);
describe.each([false, true])("premium profile (dark=%s)", (dark) => {
  beforeEach(() => document.documentElement.classList.toggle("dark", dark));
  afterEach(() => document.documentElement.classList.remove("dark"));
  it("shows real profile and summary, tabs, decorative icons and no invented dates", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
    expect(screen.getByText("AP")).toBeInTheDocument();
    expect(screen.getByText("@ana")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Información general", "Seguridad", "Sesiones"]);
    for (const tab of tabs) expect(tab.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const summary = screen.getByRole("region", { name: "Resumen de cuenta" });
    for (const value of ["ana", profile.correo, "ESTADISTICA", "Activo"]) expect(within(summary).getByText(value)).toBeInTheDocument();
    expect(summary).toHaveTextContent("Roles (1)");
    expect(document.body.textContent).not.toMatch(/Fecha de alta|Fecha de creación|Miembro desde|2026/);
    expect(api.listSessions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cambiar contraseña" })).not.toBeInTheDocument();
  });
  it("syncs URL preserving other params and supports history and invalid fallback", async () => {
    const user = userEvent.setup(); mount("?tab=invalid&keep=1");
    expect(screen.getByRole("tab", { name: "Información general" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByLabelText("URL")).toHaveTextContent("tab=general"));
    await user.click(screen.getByRole("tab", { name: "Seguridad" }));
    expect(screen.getByLabelText("URL")).toHaveTextContent("tab=security&keep=1");
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByRole("tab", { name: "Información general" })).toHaveAttribute("aria-selected", "true");
  });
  it("retains open edit/password dialog state across URL tab changes", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.type(screen.getByLabelText(/^Primer nombre/), " María");
    await act(async () => navigateOutside("?tab=security"));
    expect(screen.getByRole("dialog", { name: "Editar información personal" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Primer nombre/)).toHaveValue("Ana María");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    await user.type(screen.getByLabelText(/^Nueva contraseña/), "Nueva-123!");
    await act(async () => navigateOutside("?tab=general"));
    expect(screen.getByRole("dialog", { name: "Cambiar contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nueva contraseña/)).toHaveValue("Nueva-123!");
    expect(within(screen.getByRole("list", { name: "Requisitos de contraseña" })).getAllByText("cumplido")).toHaveLength(5);
    expect(api.listSessions).not.toHaveBeenCalled();
  });
  it("supports direct sessions links and lazy loading only once until refresh", async () => {
    const user = userEvent.setup(); mount("?tab=sessions");
    await screen.findByRole("list", { name: "Sesiones activas" });
    expect(api.listSessions).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("tab", { name: "Información general" }));
    await sessions(user);
    expect(api.listSessions).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
  });
  it("renders device, raw UA only in title, IP, real local dates and current badge", async () => {
    const user = userEvent.setup(); mount(); const list = await sessions(user);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Dispositivo desconocido");
    expect(within(items[0]).getByText("Sesión actual")).toHaveAttribute("data-slot", "badge");
    expect(within(items[0]).queryByRole("button", { name: "Revocar" })).not.toBeInTheDocument();
    expect(items[0]).toHaveTextContent("—");
    const label = within(items[1]).getByText("Chrome · Windows");
    expect(label).toHaveAttribute("title", other.agente_usuario);
    expect(items[1]).not.toHaveTextContent(other.agente_usuario);
    expect(items[1]).toHaveTextContent(other.direccion_ip);
    const formatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });
    for (const item of items) {
      expect(item).toHaveTextContent("Inicio de sesión"); expect(item).toHaveTextContent("Última actividad");
      expect(item).toHaveTextContent(formatter.format(new Date(currentSession.fecha_creacion)));
      expect(item).toHaveTextContent(formatter.format(new Date(currentSession.fecha_ultima_actividad)));
    }
  });
  it("cancel does not revoke; success blocks duplicate submits, closes and removes session", async () => {
    const user = userEvent.setup(); mount(); await sessions(user); await revoke(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.revokeSession).not.toHaveBeenCalled(); expect(within(screen.getByRole("list", { name: "Sesiones activas" })).getAllByRole("listitem")).toHaveLength(2);
    let resolve!: () => void;
    vi.mocked(api.revokeSession).mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    await revoke(user); await user.click(screen.getByRole("button", { name: "Revocar sesión" }));
    expect(screen.getByRole("button", { name: "Revocando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => resolve());
    expect(await screen.findByRole("status")).toHaveTextContent("Sesión revocada.");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Revocar" })).not.toBeInTheDocument();
    expect(api.revokeSession).toHaveBeenCalledExactlyOnceWith("other");
  });
  it("404 closes dialog, refetches and announces informational toast", async () => {
    const user = userEvent.setup(); mount(); await sessions(user);
    vi.mocked(api.revokeSession).mockRejectedValue(new ApiError(404, "private", null));
    vi.mocked(api.listSessions).mockResolvedValue([currentSession]);
    await revoke(user); await user.click(screen.getByRole("button", { name: "Revocar sesión" }));
    expect(await screen.findByRole("status")).toHaveTextContent("La sesión ya no está disponible.");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.listSessions).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Revocar" })).not.toBeInTheDocument();
  });
  it.each([0, 409, 500])("error %s retains list/dialog and permits retry without exposing server details", async (status) => {
    const user = userEvent.setup(); mount(); await sessions(user);
    vi.mocked(api.revokeSession).mockRejectedValue(new ApiError(status, "private", null));
    await revoke(user); await user.click(screen.getByRole("button", { name: "Revocar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(status === 409 ? "usa «Cerrar sesión»" : status === 0 ? "No se pudo conectar" : "No se pudo completar");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revocar sesión" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(document.body.textContent).not.toContain("private");
    expect(api.listSessions).toHaveBeenCalledTimes(1);
    vi.mocked(api.revokeSession).mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Revocar sesión" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.revokeSession).toHaveBeenCalledTimes(2);
  });
  it("shows loading, load error with retry, then empty state", async () => {
    let reject!: (error: unknown) => void;
    vi.mocked(api.listSessions).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const user = userEvent.setup(); mount(); await user.click(screen.getByRole("tab", { name: "Sesiones" }));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando sesiones…");
    const logoutAll = screen.getByRole("button", { name: "Cerrar todas las sesiones" });
    expect(logoutAll).toBeEnabled();
    await user.click(logoutAll);
    expect(screen.getByRole("alertdialog", { name: "¿Cerrar todas las sesiones?" })).toHaveAccessibleDescription("Se cerrarán todas tus sesiones activas y tendrás que iniciar sesión de nuevo.");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await act(async () => reject(new ApiError(0, "private", null)));
    expect(screen.getByText("No se pudo conectar con el servidor. Intenta de nuevo.")).toBeInTheDocument();
    expect(logoutAll).toBeEnabled();
    vi.mocked(api.listSessions).mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay sesiones activas disponibles.")).toBeInTheDocument();
    expect(logoutAll).toBeEnabled();
    expect(api.revokeSession).not.toHaveBeenCalled();
    expect(api.listSessions).toHaveBeenCalledTimes(2);
  });
});
