// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { downloadBlob } from "@/lib/table-export";
import type { AnnarAnalysis, LabConsumptionRow } from "../types";
import { AnalysisTab } from "./analysis-tab";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { post: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
const row = (changes: Partial<LabConsumptionRow> = {}): LabConsumptionRow => ({ cnsctvo_dcto: "0001", cdgo_prcdmnto: "00901", lna_prdcto: "LABORATORIO", procedimiento: "HEMOGRAMA", cntdd: 2, fcha_ingrso_pcnte: "2026-01-02", fcha_dcto: "2026-01-03", admision: "10", estado: "CERRADO", emprs: "EMPRESA", dscrp_transcn: "FACTURA", sede: "CENTRO", ...changes });
const annar: AnnarAnalysis[] = [{ examen: "02", descripcion: "AGRUPACIÓN ANNAR", cantidad: 7 }, { examen: "01", descripcion: "OTRA", cantidad: 1.5 }];
it("exports exactly the displayed local sums and backend ANNAR rows, with pending state and a single download", async () => {
  let resolve!: (file: Blob) => void;
  vi.mocked(httpClient.post).mockImplementationOnce(() => new Promise((done) => { resolve = done as typeof resolve; }));
  render(<AnalysisTab facturas={[row({ procedimiento: "" }), row({ cdgo_prcdmnto: "902", procedimiento: "OTRO", cntdd: 1 })]} admisiones={[row({ cntdd: 3 })]} serLaboral={[row({ cntdd: 4, procedimiento: "DESCRIPCIÓN POSTERIOR" })]} annar={annar} />);
  const applicationRows = within(screen.getByRole("table", { name: "Datos Aplicativo" })).getAllByRole("row").slice(1);
  expect(applicationRows.map((row) => row.textContent)).toEqual(["00901HEMOGRAMA9", "902OTRO1"]);
  const annarTable = within(screen.getByRole("table", { name: "Annar Lab" }));
  expect(annarTable.getByRole("columnheader", { name: "Código" })).toBeVisible();
  const annarRows = annarTable.getAllByRole("row").slice(1);
  expect(annarRows[0]).toHaveTextContent("02AGRUPACIÓN ANNAR7");
  const button = screen.getByRole("button", { name: "Exportar a Excel" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
  fireEvent.click(button);
  expect(httpClient.post).toHaveBeenCalledTimes(1);
  expect(httpClient.post).toHaveBeenCalledWith("/statistics/administrative/lab-consumption/export/analysis/xlsx", {
    body: { aplicativo: [{ cups: "00901", descripcion: "HEMOGRAMA", cantidad: 9 }, { cups: "902", descripcion: "OTRO", cantidad: 1 }], annar },
    responseType: "blob",
    signal: expect.any(AbortSignal),
  });
  const file = new Blob(["analysis"]);
  await act(async () => resolve(file));
  expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(file, "analisis-consumo-laboratorio.xlsx");
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute("aria-busy", "false");
});
it("disables export when both tables are empty without sending a request", () => {
  render(<AnalysisTab facturas={[]} admisiones={[]} serLaboral={[]} annar={[]} />);
  const button = screen.getByRole("button", { name: "Exportar a Excel" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(httpClient.post).not.toHaveBeenCalled();
  expect(downloadBlob).not.toHaveBeenCalled();
});
it.each(["aplicativo", "annar"])("exports when only %s has rows", async (source) => {
  const file = new Blob(["analysis"]);
  vi.mocked(httpClient.post).mockResolvedValue(file);
  render(<AnalysisTab facturas={source === "aplicativo" ? [row()] : []} admisiones={[]} serLaboral={[]} annar={source === "annar" ? annar : []} />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, "analisis-consumo-laboratorio.xlsx"));
  expect(httpClient.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: {
    aplicativo: source === "aplicativo" ? [{ cups: "00901", descripcion: "HEMOGRAMA", cantidad: 2 }] : [],
    annar: source === "annar" ? annar : [],
  } }));
});
it("shows a safe error, preserves displayed rows and permits retry", async () => {
  vi.mocked(httpClient.post).mockRejectedValueOnce(new Error("private detail"));
  const file = new Blob(["retry"]);
  vi.mocked(httpClient.post).mockResolvedValueOnce(file);
  render(<AnalysisTab facturas={[row()]} admisiones={[]} serLaboral={[]} annar={annar} />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo exportar el análisis. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(screen.getByText("HEMOGRAMA")).toBeVisible();
  expect(screen.getByText("AGRUPACIÓN ANNAR")).toBeVisible();
  const button = screen.getByRole("button", { name: "Exportar a Excel" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, "analisis-consumo-laboratorio.xlsx"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("aborts a pending export on unmount and ignores its late result", async () => {
  let resolve!: (file: Blob) => void;
  vi.mocked(httpClient.post).mockImplementationOnce(() => new Promise((done) => { resolve = done as typeof resolve; }));
  const { unmount } = render(<AnalysisTab facturas={[row()]} admisiones={[]} serLaboral={[]} annar={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
  const signal = vi.mocked(httpClient.post).mock.lastCall![1]!.signal!;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(new Blob(["late"])));
  expect(downloadBlob).not.toHaveBeenCalled();
});
