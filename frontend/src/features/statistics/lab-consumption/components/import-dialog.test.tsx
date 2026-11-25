// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { labConsumptionApi } from "../api/lab-consumption-api";
import type { AnnarLabReport, SerLaboralReport } from "../types";
import { ImportDialog } from "./import-dialog";

vi.mock("../api/lab-consumption-api", () => ({ labConsumptionApi: { uploadSerLaboral: vi.fn(), uploadAnnarLab: vi.fn() } }));
const ser: SerLaboralReport = { ser_laboral_id: "ser", filas: [], total: 3, omitidas: 2, advertencias: ["Advertencia CSV"] };
const annar: AnnarLabReport = { annar_lab_id: "annar", filas: [], total: 4, advertencias: [], analisis_annar: [] };
const csv = () => new File(["csv"], "informe.csv");
const xls = () => new File(["xls"], "informe.xls");
function setup() {
  const props = { onClose: vi.fn(), controller: new AbortController(), onPending: vi.fn(), onSerLaboral: vi.fn(), onAnnarLab: vi.fn(), onSuccess: vi.fn() };
  render(<ImportDialog {...props} />);
  return props;
}
function select(label: string, file: File) { fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockResolvedValue(ser);
  vi.mocked(labConsumptionApi.uploadAnnarLab).mockResolvedValue(annar);
});
it("labels both cards, disables import until selection and supports removal and cancellation", () => {
  const props = setup();
  expect(screen.getByRole("dialog", { name: "Importar archivos" })).toBeVisible();
  expect(screen.getByRole("group", { name: "CSV de Ser Laboral" })).toBeVisible();
  expect(screen.getByRole("group", { name: "Excel de ANNAR LAB" })).toBeVisible();
  expect(screen.getByLabelText("CSV Ser Laboral")).toHaveAttribute("accept", ".csv");
  expect(screen.getByLabelText("Excel ANNAR LAB")).toHaveAttribute("accept", ".xls,.xlsx");
  expect(screen.getByText("Formatos aceptados: Excel (.xls) y (.xlsx)")).toBeVisible();
  expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  select("CSV Ser Laboral", csv());
  expect(screen.getByText("informe.csv")).toBeVisible();
  expect(screen.getByRole("button", { name: "Importar" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Quitar informe.csv" }));
  expect(screen.queryByText("informe.csv")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(labConsumptionApi.uploadSerLaboral).not.toHaveBeenCalled();
});
it.each([["CSV Ser Laboral", "ser.xls", ".csv"], ["Excel ANNAR LAB", "annar.csv", ".xls o .xlsx"]])("rejects invalid extension for %s without uploading", (label, name, extension) => {
  setup();
  select(label, new File(["bad"], name));
  expect(screen.getByRole("alert")).toHaveTextContent(`Selecciona un archivo ${extension}`);
  expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  expect(labConsumptionApi.uploadSerLaboral).not.toHaveBeenCalled();
  expect(labConsumptionApi.uploadAnnarLab).not.toHaveBeenCalled();
});
it.each(["xls", "xlsx"])("selects ANNAR %s inline, removes it without uploading, then imports it", async (extension) => {
  const props = setup();
  const zone = screen.getByRole("region", { name: "Zona de carga de Excel de ANNAR LAB" });
  const file = new File([new Uint8Array(1536)], `informe.${extension}`);
  select("Excel ANNAR LAB", file);
  expect(within(zone).getByText(file.name)).toBeVisible();
  expect(within(zone).getByText(extension.toUpperCase())).toBeVisible();
  expect(within(zone).getByText("1,5 KB")).toBeVisible();
  expect(within(zone).queryByText("Arrastra y suelta tu archivo aquí")).not.toBeInTheDocument();
  fireEvent.click(within(zone).getByRole("button", { name: `Quitar ${file.name}` }));
  expect(within(zone).getByRole("button", { name: "Seleccionar archivo para Excel de ANNAR LAB" })).toBeEnabled();
  expect(within(zone).getByText("Arrastra y suelta tu archivo aquí")).toBeVisible();
  expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  expect(labConsumptionApi.uploadAnnarLab).not.toHaveBeenCalled();
  select("Excel ANNAR LAB", file);
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  await act(async () => {});
  expect(labConsumptionApi.uploadAnnarLab).toHaveBeenCalledExactlyOnceWith(file, props.controller.signal);
  expect(labConsumptionApi.uploadSerLaboral).not.toHaveBeenCalled();
  expect(props.onAnnarLab).toHaveBeenCalledExactlyOnceWith(annar);
  expect(props.onSuccess).toHaveBeenCalledExactlyOnceWith("annar-lab");
});
it("starts parallel uploads, displays individual outcomes, and retries only the failed file", async () => {
  const a = deferred<SerLaboralReport>(); const b = deferred<AnnarLabReport>();
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockReturnValueOnce(a.promise);
  vi.mocked(labConsumptionApi.uploadAnnarLab).mockReturnValueOnce(b.promise);
  const props = setup(); const first = csv(); const second = xls();
  select("CSV Ser Laboral", first); select("Excel ANNAR LAB", second);
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  expect(labConsumptionApi.uploadSerLaboral).toHaveBeenCalledWith(first, props.controller.signal);
  expect(labConsumptionApi.uploadAnnarLab).toHaveBeenCalledWith(second, props.controller.signal);
  expect(screen.getByRole("button", { name: "Importando…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(screen.getAllByText("Subiendo y procesando archivo…")).toHaveLength(2);
  expect(screen.getByLabelText("CSV Ser Laboral")).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(props.onClose).not.toHaveBeenCalled();
  await act(async () => a.resolve(ser));
  const card = screen.getByRole("group", { name: "CSV de Ser Laboral" });
  expect(within(card).getByRole("status")).toHaveTextContent("Ser Laboral: 3 registros importados. Omitidas: 2.");
  expect(within(card).getByText("Advertencia CSV")).toBeVisible();
  expect(within(card).queryByText("Subiendo y procesando archivo…")).not.toBeInTheDocument();
  await act(async () => b.reject(new ApiError(422, "Falta Seccion", null)));
  expect(screen.getByRole("alert")).toHaveTextContent("Falta Seccion");
  expect(props.onSuccess).not.toHaveBeenCalled();
  expect(props.onPending.mock.calls).toEqual([[true], [false]]);
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  await act(async () => {});
  expect(labConsumptionApi.uploadSerLaboral).toHaveBeenCalledTimes(1);
  expect(labConsumptionApi.uploadAnnarLab).toHaveBeenCalledTimes(2);
  expect(props.onSerLaboral).toHaveBeenCalledExactlyOnceWith(ser);
  expect(props.onAnnarLab).toHaveBeenCalledExactlyOnceWith(annar);
  expect(props.onSuccess).toHaveBeenCalledExactlyOnceWith("annar-lab");
});
it.each(["ser", "annar", "both"])("preserves successful import of %s and the completion tab", async (source) => {
  const props = setup();
  if (source !== "annar") select("CSV Ser Laboral", csv());
  if (source !== "ser") select("Excel ANNAR LAB", xls());
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  await act(async () => {});
  expect(props.onSuccess).toHaveBeenCalledExactlyOnceWith(source === "annar" ? "annar-lab" : "ser-laboral");
  expect(labConsumptionApi.uploadSerLaboral).toHaveBeenCalledTimes(source === "annar" ? 0 : 1);
  expect(labConsumptionApi.uploadAnnarLab).toHaveBeenCalledTimes(source === "ser" ? 0 : 1);
});
it("ignores late responses after the owner aborts", async () => {
  const pending = deferred<SerLaboralReport>();
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockReturnValueOnce(pending.promise);
  const props = setup(); select("CSV Ser Laboral", csv());
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  props.controller.abort();
  await act(async () => pending.resolve(ser));
  expect(props.onSerLaboral).not.toHaveBeenCalled();
  expect(props.onSuccess).not.toHaveBeenCalled();
});
it("shows server errors and safe network fallback, then allows replacement", async () => {
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockRejectedValueOnce(new ApiError(413, "Archivo demasiado grande", null));
  vi.mocked(labConsumptionApi.uploadAnnarLab).mockRejectedValueOnce(new Error("network internals"));
  setup(); select("CSV Ser Laboral", csv()); select("Excel ANNAR LAB", xls());
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  await act(async () => {});
  expect(screen.getAllByRole("alert").map((el) => el.textContent)).toEqual(["Archivo demasiado grande", "No se pudo importar el archivo. Intenta de nuevo."]);
  select("CSV Ser Laboral", new File(["new"], "nuevo.csv"));
  expect(screen.queryByText("Archivo demasiado grande")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Importar" }));
  await act(async () => {});
  expect(labConsumptionApi.uploadSerLaboral).toHaveBeenLastCalledWith(expect.objectContaining({ name: "nuevo.csv" }), expect.any(AbortSignal));
});
