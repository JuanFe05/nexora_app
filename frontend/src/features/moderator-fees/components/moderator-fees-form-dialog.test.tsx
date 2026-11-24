// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shared/toast/toast-provider";
import * as api from "../api/moderator-fees-api";
import { ModeratorFeesFormDialog } from "./moderator-fees-form-dialog";

vi.mock("../api/moderator-fees-api", async original => ({ ...await original<typeof api>(), saveModeratorFees: vi.fn() }));
const fee = { vigencia: 2026, importes: [5000, 20100], actualizado_por: null, actualizado_en: "2026-01-01T00:00:00Z" };
afterEach(() => { cleanup(); vi.resetAllMocks(); document.documentElement.classList.remove("dark"); });
function mount(edit = true) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<ToastProvider><ModeratorFeesFormDialog fee={edit ? fee : undefined} onClose={onClose} onSaved={onSaved} /></ToastProvider>);
  return { onClose, onSaved };
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }

describe("Moderator fees form controls", () => {
  it.each([false, true])("formats on blur without changing exact integer payload (dark=%s)", async dark => {
    document.documentElement.classList.toggle("dark", dark);
    vi.mocked(api.saveModeratorFees).mockResolvedValue(fee);
    const { onSaved } = mount();
    const input = screen.getByLabelText("Importe 1");
    expect(input).toHaveValue("5.000");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "numeric");
    await userEvent.click(input);
    expect(input).toHaveValue("5000");
    await userEvent.clear(input);
    await userEvent.type(input, "5123");
    expect(input).toHaveValue("5123");
    await userEvent.tab();
    expect(input).toHaveValue("5.123");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(api.saveModeratorFees).toHaveBeenCalledExactlyOnceWith(2026, [5123, 20100]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });
  it("steps by 1000 with buttons and arrow keys and never submits", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Aumentar importe 2" }));
    expect(screen.getByLabelText("Importe 2")).toHaveValue("21.100");
    await userEvent.click(screen.getByRole("button", { name: "Disminuir importe 2" }));
    const input = screen.getByLabelText("Importe 2");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowDown}");
    expect(input).toHaveValue("21100");
    expect(api.saveModeratorFees).not.toHaveBeenCalled();
  });
  it("clamps step actions, disables bounds and initializes an empty amount", async () => {
    mount(false);
    const input = screen.getByLabelText("Importe 1");
    await userEvent.click(screen.getByRole("button", { name: "Aumentar importe 1" }));
    expect(input).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Disminuir importe 1" })).toBeDisabled();
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveValue("1");
    change("Importe 1", "999500");
    await userEvent.keyboard("{ArrowUp}");
    expect(input).toHaveValue("1000000");
    expect(screen.getByRole("button", { name: "Aumentar importe 1" })).toBeDisabled();
    await userEvent.keyboard("{ArrowUp}");
    expect(input).toHaveValue("1000000");
    change("Importe 1", "500");
    await userEvent.click(screen.getByRole("button", { name: "Disminuir importe 1" }));
    expect(input).toHaveValue("1");
    change("Importe 1", "1000001");
    await userEvent.click(screen.getByRole("button", { name: "Disminuir importe 1" }));
    expect(input).toHaveValue("999.001");
    expect(api.saveModeratorFees).not.toHaveBeenCalled();
  });
  it("keeps vigencia locked and explains it while editing", () => {
    mount();
    expect(screen.getByLabelText("Vigencia")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Vigencia")).toHaveAccessibleDescription("La vigencia no se puede modificar al editar.");
  });
  it("shows the amount range and maximum-count hint; preserves cancel", async () => {
    const { onClose } = mount(false);
    expect(screen.getByText(/Entre \$1 y \$1\.000\.000/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Quitar importe 1" })).toBeDisabled();
    for (let i = 1; i < 10; i++) await userEvent.click(screen.getByRole("button", { name: "Agregar importe" }));
    const add = screen.getByRole("button", { name: "Agregar importe" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription("Has alcanzado el máximo de 10 importes.");
    await userEvent.click(screen.getByRole("button", { name: "Quitar importe 10" }));
    expect(add).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.saveModeratorFees).not.toHaveBeenCalled();
  });
  it("locks all controls, displays a spinner and blocks close while saving", async () => {
    let resolve!: (value: typeof fee) => void;
    vi.mocked(api.saveModeratorFees).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { onClose, onSaved } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Guardando" })).toBeVisible();
    for (const name of ["Aumentar importe 1", "Disminuir importe 1", "Agregar importe", "Quitar importe 1", "Cancelar", "Cerrar"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByLabelText("Vigencia")).toBeDisabled();
    expect(screen.getByLabelText("Importe 1")).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve(fee));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(api.saveModeratorFees).toHaveBeenCalledTimes(1);
  });
});
