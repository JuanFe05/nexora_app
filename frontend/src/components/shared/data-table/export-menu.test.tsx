// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ExportError, type ExportColumn } from "@/lib/table-export";
import { ExportMenu } from "./export-menu";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const columns: ExportColumn[] = [
  { id: "a", type: "text" },
  { id: "b", type: "text" },
  { id: "c", type: "number" },
];

async function choose(scope: RegExp, format: string) {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: scope }));
  fireEvent.click(await screen.findByRole("menuitem", { name: format }));
}

it("offers exactly one format per operation and exports the chosen columns in it", async () => {
  const exportFile = vi.fn().mockResolvedValue(undefined);
  render(<ExportMenu columns={columns} visibleIds={["c", "a"]} exportFile={exportFile} />);
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Columnas visibles \(2\)/ }));
  expect(await screen.findAllByRole("menuitem", { name: /CSV|Excel/ })).toHaveLength(2);
  expect(screen.queryByRole("menuitem", { name: /CSV y Excel/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
  await waitFor(() => expect(exportFile).toHaveBeenCalledTimes(1));
  expect(exportFile).toHaveBeenCalledWith([columns[0], columns[2]], "csv", expect.any(AbortSignal));
  await choose(/Todas las columnas \(3\)/, "Excel (.xlsx)");
  await waitFor(() => expect(exportFile).toHaveBeenCalledTimes(2));
  expect(exportFile).toHaveBeenLastCalledWith(columns, "xlsx", expect.any(AbortSignal));
});

it("shows safe errors, keeps the button usable and supports being disabled", async () => {
  const exportFile = vi
    .fn()
    .mockRejectedValueOnce(new ExportError("Demasiados registros."))
    .mockRejectedValueOnce(new Error("internal detail"));
  const { rerender } = render(
    <ExportMenu columns={columns} visibleIds={["a"]} exportFile={exportFile} />,
  );
  await choose(/Todas las columnas/, "CSV");
  expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados registros.");
  await choose(/Todas las columnas/, "CSV");
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo exportar la información. Intenta de nuevo.",
    ),
  );
  expect(screen.queryByText(/internal detail/)).not.toBeInTheDocument();
  rerender(
    <ExportMenu columns={columns} visibleIds={["a"]} exportFile={exportFile} disabled />,
  );
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
});
