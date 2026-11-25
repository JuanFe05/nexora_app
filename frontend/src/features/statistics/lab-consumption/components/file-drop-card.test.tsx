// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FileDropCard, type FileDropCardProps } from "./file-drop-card";

afterEach(cleanup);
function Harness(props: Partial<FileDropCardProps> = {}) {
  const [file, setFile] = useState<File | null>(null);
  return <FileDropCard id="test-file" title="ANNAR LAB" inputLabel="Excel ANNAR LAB" accept=".xls" hint="Excel 97-2003 (.xls)" file={file} onFileChange={setFile} {...props} />;
}
function drop(file: File) { fireEvent.drop(screen.getByRole("region", { name: "Zona de carga de ANNAR LAB" }), { dataTransfer: { files: [file], types: ["Files"] } }); }
it("supports drop, localized size, extension badge, name and removal", () => {
  render(<Harness />);
  const zone = screen.getByRole("region", { name: "Zona de carga de ANNAR LAB" });
  fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
  expect(screen.getByText("Suelta el archivo aquí")).toBeVisible();
  drop(new File([new Uint8Array(1536)], "Reporte.XLS"));
  expect(screen.getByText("Reporte.XLS")).toBeVisible();
  expect(screen.getByText("XLS")).toBeVisible();
  expect(screen.getByText("1,5 KB")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Quitar Reporte.XLS" }));
  expect(screen.queryByText("Reporte.XLS")).not.toBeInTheDocument();
  expect(screen.getByText("Arrastra y suelta tu archivo aquí")).toBeVisible();
});
it.each([
  { title: "CSV de Ser Laboral", accept: ".csv" as const, name: "informe.csv", badge: "CSV" },
  { title: "ANNAR LAB", accept: ".xls" as const, name: "informe.xls", badge: "XLS" },
])("replaces the placeholder inside the same area for $title and restores it with keyboard removal", async ({ title, accept, name, badge }) => {
  const user = userEvent.setup();
  render(<Harness title={title} accept={accept} />);
  const zone = screen.getByRole("region", { name: `Zona de carga de ${title}` });
  const input = screen.getByLabelText("Excel ANNAR LAB");
  await user.upload(input, new File([new Uint8Array(1536)], name));
  expect(screen.getByRole("region", { name: `Zona de carga de ${title}` })).toBe(zone);
  expect(within(zone).getByText(name)).toBeVisible();
  expect(within(zone).getByText(badge)).toBeVisible();
  expect(within(zone).getByText("1,5 KB")).toBeVisible();
  expect(screen.queryByText("Arrastra y suelta tu archivo aquí")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: `Seleccionar archivo para ${title}` })).not.toBeInTheDocument();
  await user.tab();
  expect(within(zone).getByRole("button", { name: `Quitar ${name}` })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.queryByText(name)).not.toBeInTheDocument();
  expect(within(zone).getByText("Arrastra y suelta tu archivo aquí")).toBeVisible();
  expect(within(zone).getByRole("button", { name: `Seleccionar archivo para ${title}` })).toBeEnabled();
});
it.each(["drop", "select"])("accepts uppercase XLSX via %s and preserves it when an invalid replacement is rejected", (method) => {
  render(<Harness accept={".xls,.xlsx" as FileDropCardProps["accept"]} />);
  const file = new File([new Uint8Array(1536)], "Reporte.XLSX");
  if (method === "drop") drop(file);
  else fireEvent.change(screen.getByLabelText("Excel ANNAR LAB"), { target: { files: [file] } });
  const zone = screen.getByRole("region", { name: "Zona de carga de ANNAR LAB" });
  expect(within(zone).getByText("Reporte.XLSX")).toBeVisible();
  expect(within(zone).getByText("XLSX")).toBeVisible();
  expect(within(zone).getByText("1,5 KB")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  drop(new File(["bad"], "informe.xls.exe"));
  expect(screen.getByRole("alert")).toHaveTextContent("Selecciona un archivo .xls o .xlsx para ANNAR LAB. El archivo «informe.xls.exe» no es compatible.");
  expect(screen.getByLabelText("Excel ANNAR LAB")).toHaveAccessibleDescription(/Selecciona un archivo .xls o .xlsx/);
  expect(within(zone).getByText("Reporte.XLSX")).toBeVisible();
  expect(screen.queryByText("informe.xls.exe")).not.toBeInTheDocument();
  fireEvent.click(within(zone).getByRole("button", { name: "Quitar Reporte.XLSX" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Excel ANNAR LAB")).toHaveAttribute("aria-invalid", "false");
});
it("opens the picker with keyboard, selects and formats MB", async () => {
  const user = userEvent.setup(); render(<Harness />);
  const input = screen.getByLabelText("Excel ANNAR LAB");
  const click = vi.spyOn(input, "click");
  await user.tab();
  expect(screen.getByRole("button", { name: "Seleccionar archivo para ANNAR LAB" })).toHaveFocus();
  await user.keyboard("{Enter}"); expect(click).toHaveBeenCalledOnce();
  await user.keyboard(" "); expect(click).toHaveBeenCalledTimes(2);
  await user.upload(input, new File([new Uint8Array(1572864)], "grande.xls"));
  expect(screen.getByText("grande.xls")).toBeVisible();
  expect(screen.getByText("1,5 MB")).toBeVisible();
});
it.each(["drop", "select"])("rejects xlsx by %s, associates the inline error, and recovers with a valid file", (method) => {
  render(<Harness />);
  const invalid = new File(["bad"], "informe.xlsx");
  if (method === "drop") drop(invalid);
  else fireEvent.change(screen.getByLabelText("Excel ANNAR LAB"), { target: { files: [invalid] } });
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Selecciona un archivo .xls para ANNAR LAB. El archivo «informe.xlsx» no es compatible.");
  expect(screen.getByLabelText("Excel ANNAR LAB")).toHaveAccessibleDescription(/Selecciona un archivo .xls/);
  expect(screen.getByLabelText("Excel ANNAR LAB")).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("button", { name: "Quitar informe.xlsx" })).not.toBeInTheDocument();
  drop(new File(["xls"], "bien.xls"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("bien.xls")).toBeVisible();
});
it("keeps a valid selection when a rejected replacement is dropped", () => {
  const onFileChange = vi.fn(); render(<Harness onFileChange={onFileChange} file={new File(["ok"], "original.xls")} />);
  drop(new File(["bad"], "otro.xlsx"));
  expect(onFileChange).not.toHaveBeenCalled();
  expect(screen.getByText("original.xls")).toBeVisible();
  expect(screen.getByRole("alert")).toBeVisible();
});
it("ignores picker cancellation and resets the input so the same file can be selected again", async () => {
  const user = userEvent.setup(); render(<Harness />);
  const input = screen.getByLabelText("Excel ANNAR LAB") as HTMLInputElement;
  const file = new File(["xls"], "repetido.xls");
  await user.upload(input, file);
  expect(input.value).toBe("");
  fireEvent.change(input, { target: { files: [] } });
  expect(screen.getByText("repetido.xls")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Quitar repetido.xls" }));
  await user.upload(input, file);
  expect(screen.getByText("repetido.xls")).toBeVisible();
});
it("blocks changes while disabled including drops", () => {
  const onFileChange = vi.fn(); render(<Harness disabled onFileChange={onFileChange} file={new File(["ok"], "listo.xls")} />);
  expect(screen.getByLabelText("Excel ANNAR LAB")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Seleccionar archivo para ANNAR LAB" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Quitar listo.xls" })).toBeDisabled();
  drop(new File(["other"], "otro.xls"));
  expect(onFileChange).not.toHaveBeenCalled();
});
