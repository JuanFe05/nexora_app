// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
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
it("selects individually, searches, removes chips, counts and toggles all options", async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  await user.click(screen.getByRole("button", { name: /Sede/ }));
  await user.click(screen.getByRole("option", { name: "Norte" }));
  expect(screen.getByText("1 seleccionadas")).toBeVisible();
  await user.click(screen.getByRole("option", { name: "Sur" }));
  expect(screen.getByText("2 seleccionadas")).toBeVisible();
  await user.click(screen.getByRole("option", { name: "Sur" }));
  await user.type(
    screen.getByRole("searchbox", { name: "Buscar en Sede" }),
    "cent",
  );
  expect(
    screen.queryByRole("option", { name: "Norte" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Centro" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  expect(screen.getByText("3 seleccionadas")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Quitar Norte" }));
  expect(screen.getByText("2 seleccionadas")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  await user.click(screen.getByRole("button", { name: "Quitar todas" }));
  expect(screen.getByText("0 seleccionadas")).toBeVisible();
});
it("opens and navigates with arrows, selects with Enter and closes with Escape returning focus", async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  const trigger = screen.getByRole("button", { name: /Sede/ });
  trigger.focus();
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(screen.getByRole("option", { name: "Sur" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.keyboard("{ArrowUp}{Enter}");
  expect(screen.getByRole("option", { name: "Norte" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it("exposes disabled, loading, empty and retry states", () => {
  const retry = vi.fn();
  const props = {
    id: "s",
    label: "Sede",
    options: [],
    value: [],
    onChange: vi.fn(),
  };
  const { rerender } = render(<MultiSelect {...props} disabled />);
  expect(screen.getByRole("button", { name: /Sede/ })).toBeDisabled();
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
  fireEvent.click(screen.getByRole("button", { name: /Sede/ }));
  expect(screen.getByText("No hay opciones disponibles.")).toBeVisible();
});
