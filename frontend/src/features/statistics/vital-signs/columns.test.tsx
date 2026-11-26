// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { vitalSignsColumns, vitalSignsExportColumns, defaultVisibleColumns } from "./columns";
import type { VitalSign } from "./types";
afterEach(cleanup);
const ids = ["sede", "linea_servicio", "tipo_documento", "nmro_idntfccn", "empresa", "emprsa_rgmen", "rgmen", "gener", "prmr_nmbre", "sgndo_nmbre", "prmr_aplldo", "sgndo_aplldo", "fcha_ncmnto", "fcha_atncn", "edad", "tipo_edad", "direccion", "mncpo_rsdncia", "teléfono", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc", "prmtro_crnl", "prmtro_brql", "cdgo_dgnstco", "diagnostico", "cdgo_dgnstco_rl_1", "diagnostico_rl_1", "cdgo_dgnstco_rl_2", "diagnostico_rl_2", "profesional_salud", "especialidad"];
it("keeps the 37 unique source aliases in order and requested defaults", () => {
  expect(vitalSignsColumns.map(({ id }) => id)).toEqual(ids);
  expect(new Set(ids).size).toBe(37);
  expect(vitalSignsExportColumns.map(({ id }) => id)).toEqual(ids);
  expect(defaultVisibleColumns).toEqual(["sede", "linea_servicio", "empresa", "fcha_atncn", "tipo_documento", "nmro_idntfccn", "prmr_nmbre", "prmr_aplldo", "edad", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc", "prmtro_brql", "cdgo_dgnstco", "profesional_salud"]);
});
it("assigns exact export types and renders dates, decimal numbers and text preserving zeros", () => {
  const numeric = ["edad", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc", "prmtro_crnl", "prmtro_brql"];
  for (const column of vitalSignsExportColumns) {
    expect(column.type).toBe(numeric.includes(column.id) ? "number" : ["fcha_ncmnto", "fcha_atncn"].includes(column.id) ? "date" : "text");
    expect(column).not.toHaveProperty("label");
  }
  const row = { nmro_idntfccn: "00123", teléfono: "000456", fcha_atncn: "2026-01-02 13:45:00", pso: 72.5, diagnostico: "Descripción ficticia" } as VitalSign;
  render(<>{vitalSignsColumns.map((column) => <div key={column.id}>{column.cell(row)}</div>)}</>);
  for (const text of ["00123", "000456", "02/01/2026", "72,5"]) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByTitle("Descripción ficticia")).toHaveClass("truncate", "max-w-72");
  expect(vitalSignsColumns.find(({ id }) => id === "pso")?.className).toContain("tabular-nums");
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  expect(document.querySelector("[data-slot=badge]")).toBeNull();
});
it.each([["12.5", "12,5"], ["0.0", "0"]] as const)("renders API decimal string %s as a default-visible numeric column", (value, expected) => {
  const column = vitalSignsColumns.find(({ id }) => id === "prmtro_brql");
  expect(column).toMatchObject({ header: "Perímetro Braquial", label: "Perímetro Braquial", type: "number" });
  expect(column?.className).toContain("tabular-nums");
  expect(defaultVisibleColumns).toContain("prmtro_brql");
  expect(vitalSignsExportColumns.find(({ id }) => id === "prmtro_brql")).toEqual({ id: "prmtro_brql", type: "number" });
  render(<>{column?.cell({ prmtro_brql: value } as VitalSign)}</>);
  expect(screen.getByText(expected)).toBeVisible();
});
