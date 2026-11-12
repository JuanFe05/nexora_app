// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableProps } from "./data-table";
import { RowActionButton } from "./row-action-button";

afterEach(cleanup);
type Row = { id: string; name: string };
function props(overrides: Partial<DataTableProps<Row>> = {}): DataTableProps<Row> {
  return { title: "Usuarios", description: "Administración", columns: [{ id: "name", header: "Nombre", cell: row => row.name }], rows: [{ id: "1", name: "Ana" }], getRowId: row => row.id, loading: false, total: 95, page: 1, pageSize: 10, pageSizeOptions: [10, 25, 50], onPageChange: vi.fn(), onPageSizeChange: vi.fn(), search: "", onSearchChange: vi.fn(), searchPlaceholder: "Buscar usuarios", ...overrides };
}
describe("DataTable", () => {
  it("adds an optional decorative icon without changing controls or title names", () => {
    const input = props({ icon: <svg data-testid="header-icon"><title>Decoración</title></svg>, headerAction: <button>Nuevo</button> });
    const { rerender } = render(<DataTable {...input} />);
    const title = screen.getByRole("heading", { level: 2, name: "Usuarios" });
    const icon = screen.getByTestId("header-icon");
    expect(icon.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(icon.parentElement).toHaveClass("size-9", "rounded-lg", "bg-gray-100", "text-gray-700", "dark:bg-white/5", "dark:text-gray-300");
    expect(title).toHaveClass("text-lg", "font-semibold", "text-gray-800", "dark:text-white/90");
    expect(screen.getByText("Administración")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en Usuarios" }), { target: { value: "ana" } });
    expect(input.onSearchChange).toHaveBeenCalledWith("ana");
    fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: "25" } });
    expect(input.onPageSizeChange).toHaveBeenCalledWith(25);
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 a 10 de 95 registros");
    rerender(<DataTable {...input} icon={undefined} />);
    expect(screen.queryByTestId("header-icon")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Usuarios" })).toBeVisible();
  });

  it("uses brand hover for editing while retaining destructive hover and equal icon dimensions", () => {
    const edit = vi.fn();
    render(<><RowActionButton aria-label="Editar Ana" onClick={edit} /><RowActionButton variant="danger" aria-label="Eliminar Ana" /></>);
    const editButton = screen.getByRole("button", { name: "Editar Ana" });
    const deleteButton = screen.getByRole("button", { name: "Eliminar Ana" });
    expect(editButton).toHaveClass("hover:bg-brand-50", "hover:text-brand-500", "dark:hover:bg-brand-500/15", "dark:hover:text-brand-400");
    expect(deleteButton).toHaveClass("text-red-500", "hover:bg-red-50", "hover:text-red-600", "dark:text-red-400", "dark:hover:bg-red-500/10");
    for (const button of [editButton, deleteButton]) {
      expect(button).toHaveClass("size-9");
      expect(button.querySelector("svg")).toHaveClass("size-5");
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    expect(editButton.querySelector("path")?.getAttribute("d")).not.toBe(deleteButton.querySelector("path")?.getAttribute("d"));
    fireEvent.click(editButton);
    expect(edit).toHaveBeenCalledOnce();
  });

  it("renders typed columns, rows, description, header slot and trailing labelled actions", () => {
    const edit = vi.fn();
    render(<DataTable {...props({ headerAction: <button>Nuevo</button>, rowActions: row => <RowActionButton aria-label={`Editar ${row.name}`} onClick={edit}>E</RowActionButton> })} />);
    expect(screen.getByRole("table", { name: "Usuarios" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Acciones" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ana" })).toBeVisible();
    expect(screen.getByText("Administración")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar Ana" }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 a 10 de 95 registros");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
  it("shows a busy nonblank table instead of empty content while loading", () => {
    render(<DataTable {...props({ loading: true, rows: [] })} />);
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Cargando registros…")).toBeInTheDocument();
    expect(screen.queryByText("No hay registros")).not.toBeInTheDocument();
  });
  it("shows error and invokes retry without empty state", () => {
    const onRetry = vi.fn();
    render(<DataTable {...props({ rows: [], error: { message: "No se pudo cargar", onRetry } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    const retry = screen.getByRole("button", { name: "Reintentar" });
    expect(retry).toHaveAttribute("title", "Reintentar");
    expect(retry.textContent).toBe("");
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    expect(retry.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("alert")).toHaveClass("flex", "justify-between", "items-center");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("No hay registros")).not.toBeInTheDocument();
  });
  it("distinguishes empty collection and active search and reports zero range", () => {
    const { rerender } = render(<DataTable {...props({ rows: [], total: 0, emptyState: { title: "Sin usuarios", description: "Agrega un usuario" } })} />);
    expect(screen.getByText("Sin usuarios")).toBeVisible();
    expect(screen.getByText("Agrega un usuario")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 0 a 0 de 0 registros");
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
    rerender(<DataTable {...props({ rows: [], total: 0, search: "nadie" })} />);
    expect(screen.getByText("No se encontraron resultados")).toBeVisible();
    expect(screen.getByText("Prueba con otra búsqueda.")).toBeVisible();
  });
  it("reserves value padding and centers a decorative chevron in both themes", () => {
    render(<DataTable {...props()} />);
    const select = screen.getByRole("combobox", { name: "Registros por página" });
    expect(select).toHaveValue("10");
    expect(select).toHaveClass("h-10", "appearance-none", "truncate", "pe-10", "ps-3", "dark:bg-gray-900", "dark:text-white/90");
    expect(select.parentElement).toHaveClass("relative");
    const icon = select.parentElement?.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveClass("pointer-events-none", "absolute", "top-1/2", "end-3", "-translate-y-1/2");
  });
  it("labels search and page size and forwards changes", () => {
    const input = props();
    render(<DataTable {...input} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en Usuarios" }), { target: { value: "ana" } });
    expect(input.onSearchChange).toHaveBeenCalledWith("ana");
    expect(screen.getByPlaceholderText("Buscar usuarios")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: "25" } });
    expect(input.onPageSizeChange).toHaveBeenCalledWith(25);
  });
  it.each([1, 6, 10])("paginates with TailAdmin ellipses at page %s", page => {
    const input = props({ page });
    render(<DataTable {...input} />);
    const nav = screen.getByRole("navigation", { name: "Paginación" });
    expect(within(nav).getByRole("button", { name: `Página ${page}` })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getAllByText("…").length).toBe(page === 6 ? 2 : 1);
    expect(screen.getByRole("button", { name: "Página anterior" })).toHaveProperty("disabled", page === 1);
    expect(screen.getByRole("button", { name: "Página siguiente" })).toHaveProperty("disabled", page === 10);
    const target = page === 1 ? "Página siguiente" : "Página anterior";
    fireEvent.click(screen.getByRole("button", { name: target }));
    expect(input.onPageChange).toHaveBeenCalledWith(page === 1 ? 2 : page - 1);
    fireEvent.click(within(nav).getByRole("button", { name: "Página 1" }));
    expect(input.onPageChange).toHaveBeenCalledWith(1);
  });
  it("shows all pages without ellipsis for small totals and the final partial range", () => {
    render(<DataTable {...props({ page: 3, total: 25 })} />);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 21 a 25 de 25 registros");
  });
  it("supports an sr-only column header and danger action styling", () => {
    render(<DataTable {...props({ columns: [{ id: "action", header: "Acción", srOnlyHeader: true, cell: () => <RowActionButton variant="danger" aria-label="Eliminar">X</RowActionButton> }] })} />);
    expect(screen.getByText("Acción")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("text-red-500");
  });
});
