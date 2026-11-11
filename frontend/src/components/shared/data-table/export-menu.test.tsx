// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ExportError, exportRows, type ExportColumn } from "@/lib/table-export";
import { ExportMenu } from "./export-menu";

vi.mock("@/lib/table-export", async (original) => ({
  ...(await original<typeof import("@/lib/table-export")>()),
  exportRows: vi.fn().mockResolvedValue(undefined),
}));
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

it("exports the visible or all columns in the chosen format with every loaded row", async () => {
  const loadRows = vi.fn().mockResolvedValue([{ a: "Norte" }]);
  render(
    <ExportMenu columns={columns} visibleIds={["c", "a"]} loadRows={loadRows} fileName="informe" />,
  );
  await choose(/Columnas visibles \(2\)/, "CSV y Excel");
  await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
  expect(exportRows).toHaveBeenCalledWith({
    columns: [columns[0], columns[2]],
    rows: [{ a: "Norte" }],
    format: "both",
    fileName: "informe",
  });
  await choose(/Todas las columnas \(3\)/, "Excel (.xlsx)");
  await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(2));
  expect(vi.mocked(exportRows).mock.calls[1][0]).toMatchObject({
    columns,
    format: "xlsx",
  });
});

it("shows safe errors, keeps the button usable and supports being disabled", async () => {
  const loadRows = vi
    .fn()
    .mockRejectedValueOnce(new ExportError("Demasiados registros."))
    .mockRejectedValueOnce(new Error("internal detail"));
  const { rerender } = render(
    <ExportMenu columns={columns} visibleIds={["a"]} loadRows={loadRows} fileName="x" />,
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
  expect(exportRows).not.toHaveBeenCalled();
  rerender(
    <ExportMenu columns={columns} visibleIds={["a"]} loadRows={loadRows} fileName="x" disabled />,
  );
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
});
