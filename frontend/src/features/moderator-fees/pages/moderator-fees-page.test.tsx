// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import { PERMISSIONS } from "@/features/auth/permissions";
import { ApiError } from "@/lib/http/api-error";
import * as api from "../api/moderator-fees-api";
import ModeratorFeesPage from "./moderator-fees-page";

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn<(code: string) => boolean>() }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => ({ hasPermission }) }));
vi.mock("../api/moderator-fees-api", async original => ({ ...await original<typeof api>(), listModeratorFees: vi.fn(), saveModeratorFees: vi.fn(), deleteModeratorFees: vi.fn() }));
const fee = { vigencia: 2026, importes: [5000, 20100, 52800], actualizado_por: "Ana Pérez", actualizado_en: "2026-03-01T12:00:00Z" };
beforeEach(() => {
  hasPermission.mockReturnValue(true);
  vi.mocked(api.listModeratorFees).mockResolvedValue([fee]);
  vi.mocked(api.saveModeratorFees).mockResolvedValue(fee);
  vi.mocked(api.deleteModeratorFees).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); document.documentElement.classList.remove("dark"); });
function mount() { render(<ToastProvider><ModeratorFeesPage /></ToastProvider>); }
async function loaded() { mount(); await screen.findByRole("cell", { name: "2026" }); }
async function create() { await userEvent.click(screen.getByRole("button", { name: "Nueva vigencia" })); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function save() { await userEvent.click(screen.getByRole("button", { name: "Guardar" })); }

describe("Cuotas Moderadoras", () => {
  it.each([false, true])("renders the COP es-CO list and audit columns (dark=%s)", async dark => {
    document.documentElement.classList.toggle("dark", dark);
    vi.mocked(api.listModeratorFees).mockResolvedValue([fee, { ...fee, vigencia: 2025, actualizado_por: null }]);
    await loaded();
    expect(screen.getByRole("table", { name: "Cuotas Moderadoras" })).toBeVisible();
    for (const header of ["Vigencia", "Importes", "Actualizado por", "Fecha"]) expect(screen.getByRole("columnheader", { name: header })).toBeVisible();
    const cells = within(screen.getByRole("cell", { name: "2026" }).closest("tr")!).getAllByRole("cell");
    expect(cells[1].textContent).toBe("$\u00a05.000 · $\u00a020.100 · $\u00a052.800");
    expect(cells[3].querySelector("time")).toHaveAttribute("datetime", fee.actualizado_en);
    expect(cells[3]).toHaveTextContent(new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fee.actualizado_en)).replace(/\s/g, " "));
    expect(screen.getByRole("cell", { name: "Ana Pérez" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "—" })).toBeVisible();
    expect(screen.getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell")[0].textContent)).toEqual(["2026", "2025"]);
  });
  it("shows loading, empty and load-error states and retries", async () => {
    let resolve!: (value: typeof fee[]) => void;
    vi.mocked(api.listModeratorFees).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    mount();
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    await act(async () => resolve([]));
    expect(await screen.findByText("No hay cuotas moderadoras")).toBeVisible();
    cleanup();
    vi.mocked(api.listModeratorFees).mockRejectedValueOnce(new ApiError(403, "No tienes permiso para consultar cuotas.", null));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso para consultar cuotas.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("cell", { name: "2026" })).toBeVisible();
  });
  it("is read-only with view and no manage", async () => {
    hasPermission.mockImplementation(code => code === PERMISSIONS.moderatorFeesView);
    await loaded();
    expect(screen.queryByRole("button", { name: "Nueva vigencia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
    expect(api.saveModeratorFees).not.toHaveBeenCalled();
    expect(api.deleteModeratorFees).not.toHaveBeenCalled();
  });
  it("creates with dynamic add/remove inputs, closes, reloads and toasts", async () => {
    await loaded(); await create();
    change("Vigencia", "2027"); change("Importe 1", "1");
    await userEvent.click(screen.getByRole("button", { name: "Agregar importe" }));
    change("Importe 2", "10000000");
    await userEvent.click(screen.getByRole("button", { name: "Agregar importe" }));
    await userEvent.click(screen.getByRole("button", { name: "Quitar importe 3" }));
    await save();
    expect(api.saveModeratorFees).toHaveBeenCalledExactlyOnceWith(2027, [1, 10000000]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Vigencia creada correctamente.")).toBeVisible();
    expect(api.listModeratorFees).toHaveBeenCalledTimes(2);
  });
  it("edits importes with a read-only vigencia", async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Editar vigencia 2026" }));
    expect(screen.getByLabelText("Vigencia")).toHaveAttribute("readonly");
    change("Importe 1", "6000"); await save();
    expect(api.saveModeratorFees).toHaveBeenCalledExactlyOnceWith(2026, [6000, 20100, 52800]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Vigencia actualizada correctamente.")).toBeVisible();
    expect(api.listModeratorFees).toHaveBeenCalledTimes(2);
  });
  it("cancels then confirms deletion and reloads with a toast", async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar vigencia 2026" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(expect.stringContaining("2026"));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.deleteModeratorFees).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar vigencia 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(api.deleteModeratorFees).toHaveBeenCalledExactlyOnceWith(2026);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("Vigencia eliminada correctamente.")).toBeVisible();
    expect(api.listModeratorFees).toHaveBeenCalledTimes(2);
  });
  it.each(["", "1999", "2101", "2026.5"])("rejects invalid vigencia %s accessibly without mutating or reloading", async value => {
    await loaded(); await create(); change("Vigencia", value); change("Importe 1", "5000"); await save();
    expect(screen.getByLabelText("Vigencia")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Vigencia")).toHaveAccessibleDescription("La vigencia debe ser un entero entre 2000 y 2100.");
    expect(screen.getByLabelText("Vigencia")).toHaveFocus();
    expect(api.saveModeratorFees).not.toHaveBeenCalled(); expect(api.listModeratorFees).toHaveBeenCalledTimes(1);
  });
  it.each(["", "0", "-1", "1.5", "10000001"])("rejects invalid importe %s accessibly without mutating or reloading", async value => {
    await loaded(); await create(); change("Vigencia", "2027"); change("Importe 1", value); await save();
    expect(screen.getByLabelText("Importe 1")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Importe 1")).toHaveAccessibleDescription("El importe debe ser un entero entre 1 y 10.000.000.");
    expect(screen.getByLabelText("Importe 1")).toHaveFocus();
    expect(api.saveModeratorFees).not.toHaveBeenCalled(); expect(api.listModeratorFees).toHaveBeenCalledTimes(1);
  });
  it.each([2000, 2100])("accepts boundary vigencia %s", async year => {
    await loaded(); await create(); change("Vigencia", String(year)); change("Importe 1", "1"); await save();
    expect(api.saveModeratorFees).toHaveBeenCalledWith(year, [1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("rejects numeric duplicates and limits the list to 1–10 inputs", async () => {
    await loaded(); await create(); change("Vigencia", "2027"); change("Importe 1", "5000");
    expect(screen.getByRole("button", { name: "Quitar importe 1" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Agregar importe" })); change("Importe 2", "05000"); await save();
    for (const label of ["Importe 1", "Importe 2"]) expect(screen.getByLabelText(label)).toHaveAccessibleDescription("Los importes deben ser únicos.");
    expect(api.saveModeratorFees).not.toHaveBeenCalled(); expect(api.listModeratorFees).toHaveBeenCalledTimes(1);
    for (let i = 3; i <= 10; i++) await userEvent.click(screen.getByRole("button", { name: "Agregar importe" }));
    expect(screen.getByRole("button", { name: "Agregar importe" })).toBeDisabled();
    for (let i = 1; i <= 10; i++) change(`Importe ${i}`, String(i));
    await save(); expect(api.saveModeratorFees).toHaveBeenCalledWith(2027, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it.each(["create", "edit", "delete"])("keeps %s open with server detail on failure without reloading", async action => {
    const message = "No tienes el permiso requerido para esta operación.";
    vi.mocked(api.saveModeratorFees).mockRejectedValue(new ApiError(403, message, null));
    vi.mocked(api.deleteModeratorFees).mockRejectedValue(new ApiError(403, message, null));
    await loaded();
    if (action === "create") { await create(); change("Vigencia", "2027"); change("Importe 1", "5000"); }
    else await userEvent.click(screen.getByRole("button", { name: `${action === "edit" ? "Editar" : "Eliminar"} vigencia 2026` }));
    if (action === "delete") await userEvent.click(screen.getByRole("button", { name: "Eliminar" })); else await save();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole(action === "delete" ? "alertdialog" : "dialog")).toBeVisible();
    expect(api.listModeratorFees).toHaveBeenCalledTimes(1);
  });
  it("prevents closing and duplicate submissions during save", async () => {
    let resolve!: (value: typeof fee) => void;
    vi.mocked(api.saveModeratorFees).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await loaded(); await create(); change("Vigencia", "2027"); change("Importe 1", "5000"); await save();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Importe 1")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => resolve(fee));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.saveModeratorFees).toHaveBeenCalledTimes(1);
  });
});
