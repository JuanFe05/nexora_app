// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MultiSelect } from "./index";

afterEach(cleanup);
const options = [
  { value: 1, label: "Norte" },
  { value: 2, label: "Sur" },
  { value: "3", label: "Centro" },
];
function Controlled() {
  const [value, onChange] = useState<Array<string | number>>([]);
  return (
    <MultiSelect
      id="sites"
      label="Sede"
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
const trigger = () => screen.getByRole("combobox", { name: /Sede/ });
it("shows the selection inside the control with a fixed-height chip and counter", async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  expect(trigger()).toHaveTextContent("Seleccionar opciones");
  await user.click(trigger());
  await user.click(screen.getByRole("option", { name: "Norte" }));
  expect(trigger()).toHaveAccessibleName("Sede: 1 seleccionadas");
  expect(trigger()).toHaveTextContent("Norte");
  expect(trigger()).not.toHaveTextContent("+");
  await user.click(screen.getByRole("option", { name: "Sur" }));
  await user.click(screen.getByRole("option", { name: "Centro" }));
  expect(trigger()).toHaveTextContent("Norte");
  expect(trigger()).toHaveTextContent("+2");
  expect(trigger()).not.toHaveTextContent("Sur");
  await user.click(screen.getByRole("option", { name: "Sur" }));
  expect(trigger()).toHaveTextContent("+1");
});
it("toggles all options from the popup and closes with Escape", async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  await user.click(trigger());
  fireEvent.click(
    await screen.findByRole("button", { name: "Seleccionar todas" }),
  );
  expect(trigger()).toHaveAccessibleName("Sede: 3 seleccionadas");
  expect(screen.getByRole("option", { name: "Sur" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Quitar todas" }));
  expect(trigger()).toHaveAccessibleName("Sede: 0 seleccionadas");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
  );
});
it("removes the visible chip without opening the popup", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <MultiSelect
      id="sites"
      label="Sede"
      options={options}
      value={[1, 2]}
      onChange={onChange}
    />,
  );
  expect(trigger()).toHaveTextContent("Norte");
  await user.click(screen.getByRole("button", { name: "Quitar Norte" }));
  expect(onChange).toHaveBeenCalledWith([2]);
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
it("searches inside a searchable select without changing the full-catalog select all", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <MultiSelect
      id="companies"
      label="Empresa"
      options={options}
      value={[]}
      onChange={onChange}
      searchable
    />,
  );
  await user.click(screen.getByRole("combobox", { name: /Empresa/ }));
  await user.type(
    await screen.findByRole("combobox", { name: "Buscar en Empresa" }),
    "cent",
  );
  expect(screen.getByRole("option", { name: "Centro" })).toBeVisible();
  expect(screen.queryByRole("option", { name: "Norte" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  expect(onChange).toHaveBeenLastCalledWith([1, 2, "3"]);
  await user.click(screen.getByRole("option", { name: "Centro" }));
  expect(onChange).toHaveBeenLastCalledWith(["3"]);
});
it("exposes disabled, loading, error and retry states", () => {
  const retry = vi.fn();
  const props = {
    id: "s",
    label: "Sede",
    options: [],
    value: [],
    onChange: vi.fn(),
  };
  const { rerender } = render(<MultiSelect {...props} disabled />);
  expect(trigger()).toHaveAttribute("aria-disabled", "true");
  rerender(<MultiSelect {...props} loading />);
  expect(screen.getByText("Cargando opciones…")).toBeVisible();
  rerender(
    <MultiSelect
      {...props}
      error="No se pudieron cargar las sedes."
      onRetry={retry}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "No se pudieron cargar las sedes.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reintentar Sede" }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(<MultiSelect {...props} />);
  expect(trigger()).not.toHaveAttribute("aria-disabled", "true");
});
