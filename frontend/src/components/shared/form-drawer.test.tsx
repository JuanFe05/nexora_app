// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormDrawer } from "./form-drawer";
import { InlineAlert } from "./inline-alert";

afterEach(cleanup);

describe("InlineAlert", () => {
  it("anuncia los errores como alert y el resto como status", () => {
    render(<><InlineAlert variant="error">falló</InlineAlert><InlineAlert variant="success">listo</InlineAlert></>);
    expect(screen.getByRole("alert")).toHaveTextContent("falló");
    expect(screen.getByRole("status")).toHaveTextContent("listo");
  });
});

describe("FormDrawer", () => {
  function setup(props: Partial<React.ComponentProps<typeof FormDrawer>> = {}) {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <FormDrawer open onOpenChange={onOpenChange} title="Nuevo usuario" description="Completa los datos" formId="f" {...props}>
        <form id="f" onSubmit={onSubmit}><label>Nombre<input name="n" /></label></form>
      </FormDrawer>,
    );
    return { onOpenChange, onSubmit };
  }

  it("muestra título, descripción y contenido, y guardar envía el formulario enlazado", async () => {
    const { onSubmit } = setup();
    expect(screen.getByRole("dialog", { name: "Nuevo usuario" })).toBeInTheDocument();
    expect(screen.getByText("Completa los datos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Cancelar cierra el panel", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mientras guarda deshabilita los botones y no se cierra con Escape", async () => {
    const { onOpenChange } = setup({ pending: true });
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
