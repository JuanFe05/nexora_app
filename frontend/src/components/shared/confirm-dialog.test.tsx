// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

afterEach(cleanup);
function Harness({ onConfirm = vi.fn(), pending = false, pendingLabel }: { onConfirm?: () => void; pending?: boolean; pendingLabel?: string }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Eliminar fila</button><ConfirmDialog open={open} onOpenChange={setOpen} title="Eliminar registro" description="Esta acción no se puede deshacer." confirmLabel="Eliminar" variant="danger" pending={pending} pendingLabel={pendingLabel} onConfirm={onConfirm} /></>;
}
describe("ConfirmDialog", () => {
  it("opens a labelled alertdialog, confirms and applies danger styling", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Eliminar fila" }));
    expect(screen.getByRole("alertdialog", { name: "Eliminar registro" })).toHaveAccessibleDescription("Esta acción no se puede deshacer.");
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("bg-red-500");
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it.each(["cancel", "escape"])("closes through %s and restores focus", async method => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Eliminar fila" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus());
    if (method === "cancel") await user.click(screen.getByRole("button", { name: "Cancelar" }));
    else await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("traps keyboard focus within the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Eliminar fila" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus());
    await user.tab({ shift: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Eliminar" })).toHaveFocus());
    await user.tab();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus());
  });
  it.each([undefined, "Guardando…"])("disables actions while pending with label %s", async pendingLabel => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness pending pendingLabel={pendingLabel} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Eliminar fila" }));
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    const confirm = screen.getByRole("button", { name: pendingLabel ?? "Eliminando…" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
