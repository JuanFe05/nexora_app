// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormDialog } from "./form-dialog";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof FormDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <FormDialog open onOpenChange={onOpenChange} title="Nuevo usuario" description="Completa los datos" formId="f" {...props}>
      <form id="f" onSubmit={onSubmit}><label>Nombre<input name="n" /></label></form>
    </FormDialog>,
  );
  return { onOpenChange, onSubmit };
}

describe("FormDialog", () => {
  it("es un diálogo modal con título, descripción y contenido; guardar envía el formulario enlazado", async () => {
    const { onSubmit } = setup();
    expect(screen.getByRole("dialog", { name: "Nuevo usuario" })).toBeInTheDocument();
    expect(screen.getByText("Completa los datos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Cancelar y Escape cierran el diálogo", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("el botón de cierre está en español", () => {
    setup();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });

  it("mientras guarda deshabilita los botones y no se cierra con Escape ni con la X", async () => {
    const { onOpenChange } = setup({ pending: true });
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
