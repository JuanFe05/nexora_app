// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionChecklist } from "./permission-checklist";

const options = [
  { id: "view", codigo: "identity.users.view", nombre: "Consultar usuarios", modulo: "identity", descripcion: "Consulta del directorio" },
  { id: "create", codigo: "identity.users.create", nombre: "Crear usuarios", modulo: "identity", descripcion: null },
  { id: "other", codigo: "caja.ver", nombre: "Ver caja", modulo: "Caja", descripcion: null },
];
afterEach(cleanup);
function Harness({ initial = [], disabled = false }: { initial?: string[]; disabled?: boolean }) {
  const [selected, setSelected] = useState(new Set(initial));
  return <PermissionChecklist options={options} selected={selected} onChange={setSelected} disabled={disabled} />;
}

describe("module permission accordion", () => {
  it("starts collapsed, shows real module headers and expands/collapses all without changing selection", async () => {
    render(<Harness />);
    const identity = screen.getByRole("group", { name: "identity" });
    expect(identity.querySelector('svg[data-slot="module-icon"]')).toHaveAttribute("aria-hidden", "true");
    expect(within(identity).getByText("Usuarios, roles y permisos de acceso.")).toBeVisible();
    expect(screen.getByText("Permisos del módulo Caja")).toBeVisible();
    expect(within(identity).getByText("0 de 2 seleccionados")).toBeVisible();
    expect(screen.getByRole("button", { name: "identity" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: "Crear usuarios" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expandir todos" }));
    expect(screen.getByRole("checkbox", { name: "Crear usuarios" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Ver caja" })).toBeVisible();
    expect(identity.querySelector('[data-slot="permission-grid"]')).toHaveClass("grid-cols-1", "sm:grid-cols-2");
    for (const permission of options) {
      const checkbox = screen.getByRole("checkbox", { name: permission.nombre });
      expect(checkbox).toBeVisible();
      const input = screen.getByLabelText(permission.nombre, { exact: true, selector: 'input[type="checkbox"]' });
      const card = checkbox.closest("label")!;
      expect(card).toContainElement(input);
      expect(card.textContent).toBe(permission.nombre);
      expect(card).toHaveAttribute("for", input.id);
      expect(screen.queryByText(permission.codigo, { exact: true })).not.toBeInTheDocument();
      if (permission.descripcion) expect(screen.queryByText(permission.descripcion)).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "Contraer todos" }));
    expect(screen.queryByRole("checkbox", { name: "Crear usuarios" })).not.toBeInTheDocument();
    expect(screen.getByText("0 de 3 seleccionados")).toBeVisible();
  });

  it("toggles only the chosen permission; module selection is isolated and never expands the module", async () => {
    render(<Harness initial={["legacy.permission"]} />);
    const identity = screen.getByRole("group", { name: "identity" });
    await userEvent.click(screen.getByRole("button", { name: "identity" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Crear usuarios" }));
    expect(screen.getByRole("checkbox", { name: "Crear usuarios" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Consultar usuarios" })).not.toBeChecked();
    const moduleAll = within(identity).getByRole("checkbox", { name: "Seleccionar todos de identity" });
    expect(moduleAll).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByText("1 de 3 seleccionados")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "identity" }));
    await userEvent.click(moduleAll);
    expect(screen.getByRole("button", { name: "identity" })).toHaveAttribute("aria-expanded", "false");
    expect(moduleAll).toBeChecked();
    expect(screen.getByText("2 de 3 seleccionados")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Seleccionar todos de Caja" })).not.toBeChecked();
    await userEvent.click(moduleAll);
    expect(moduleAll).not.toBeChecked();
    expect(screen.getByText("0 de 3 seleccionados")).toBeVisible();
  });

  it("selects/clears the catalog globally and preserves codes absent from the catalog", async () => {
    const change = vi.fn();
    const selected = new Set(["legacy.permission"]);
    const { rerender } = render(<PermissionChecklist options={options} selected={selected} onChange={change} />);
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar todos" }));
    const all = new Set(["legacy.permission", ...options.map(option => option.codigo)]);
    expect(change).toHaveBeenLastCalledWith(all);
    rerender(<PermissionChecklist options={options} selected={all} onChange={change} />);
    expect(screen.getByText("3 de 3 seleccionados")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Deseleccionar todos" }));
    expect(change).toHaveBeenLastCalledWith(selected);
  });

  it("preloads edit selections and allows inspecting disabled permissions without changing them", async () => {
    render(<Harness initial={["identity.users.view"]} disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Expandir todos" }));
    expect(screen.getByRole("checkbox", { name: "Consultar usuarios" })).toBeChecked();
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Seleccionar todos" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Crear usuarios" }));
    expect(screen.getByRole("checkbox", { name: "Crear usuarios" })).not.toBeChecked();
    expect(screen.getByText("1 de 3 seleccionados")).toBeVisible();
  });

  it("retains the empty catalog state", () => {
    render(<PermissionChecklist options={[]} selected={new Set()} onChange={vi.fn()} />);
    expect(screen.getByText("No hay permisos en el catálogo.")).toBeVisible();
    expect(screen.getByText("0 de 0 seleccionados")).toBeVisible();
    expect(screen.getByRole("button", { name: "Seleccionar todos" })).toBeDisabled();
  });
});
