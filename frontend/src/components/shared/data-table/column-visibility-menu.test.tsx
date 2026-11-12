// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ColumnVisibilityMenu } from "./column-visibility-menu";
import { DataTable } from "./data-table";
afterEach(cleanup);
it("toggles available columns but keeps at least one visible and closes with Escape", async () => {
  const user = userEvent.setup();
  function Controlled() {
    const [value, onChange] = useState(["a", "b"]);
    return (
      <ColumnVisibilityMenu
        columns={[
          { id: "a", label: "Sede" },
          { id: "b", label: "Empresa" },
        ]}
        value={value}
        onChange={onChange}
      />
    );
  }
  render(<Controlled />);
  await user.click(
    screen.getByRole("button", { name: "Columnas visibles" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Empresa" }));
  expect(screen.getByRole("checkbox", { name: "Empresa" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Sede" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Empresa" }));
  expect(screen.getByRole("checkbox", { name: "Sede" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("dialog", { name: "Columnas visibles" }),
    ).toBeVisible(),
  );
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Columnas visibles" }),
    ).toHaveFocus(),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("selects or clears every column while keeping the first one visible", async () => {
  const user = userEvent.setup();
  function Controlled() {
    const [value, onChange] = useState(["b"]);
    return (
      <ColumnVisibilityMenu
        columns={[
          { id: "a", label: "Sede" },
          { id: "b", label: "Empresa" },
          { id: "c", label: "Valor" },
        ]}
        value={value}
        onChange={onChange}
      />
    );
  }
  render(<Controlled />);
  await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
  await user.click(
    await screen.findByRole("button", { name: "Seleccionar todas las columnas" }),
  );
  expect(screen.getByRole("checkbox", { name: "Valor" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Seleccionar todas las columnas" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Quitar todas las columnas" }));
  expect(screen.getByRole("checkbox", { name: "Sede" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Empresa" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Quitar todas las columnas" })).toBeDisabled();
});
it("can opt out of search while preserving the previous default search and pagination behavior", () => {
  const onSearchChange = vi.fn();
  const props = {
    title: "Prueba",
    columns: [
      {
        id: "name",
        header: "Nombre",
        cell: (row: { name: string }) => row.name,
      },
    ],
    rows: [{ name: "Ana" }],
    getRowId: (row: { name: string }) => row.name,
    loading: false,
    total: 1,
    page: 1,
    pageSize: 10,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    search: "",
    onSearchChange,
  };
  const { rerender } = render(<DataTable {...props} showSearch={false} />);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "Registros por página" }),
  ).toHaveValue("10");
  expect(screen.getByRole("cell", { name: "Ana" })).toBeVisible();
  rerender(<DataTable {...props} />);
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Buscar en Prueba" }),
    { target: { value: "Ana" } },
  );
  expect(onSearchChange).toHaveBeenCalledWith("Ana");
});
