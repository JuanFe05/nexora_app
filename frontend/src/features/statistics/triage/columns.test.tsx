// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { triageColumns, triageExportColumns, defaultVisibleColumns } from "./columns";
import type { Triage } from "./types";
afterEach(cleanup);
const ids = ["sede", "cnsctvo_trgge", "cnsctvo_admsns", "estdo_admsn", "cdgo_tpo_dcmnto", "nmro_idntfccn", "prmr_nmbre", "sgndo_nmbre", "prmr_aplldo", "sgndo_aplldo", "edd", "tipo_edd", "fcha_ncmnto", "sexo", "empresa", "tpo_empresa", "tpo_idntfccn_profesional", "nmro_idntfccn_profesional", "profesional_salud", "cdgo", "estdo_rgstro", "fcha_ingrso", "fcha_trge", "fcha_admsn", "fcha_atncn", "t_prdmsn_trgge", "t_trgge_admsn", "t_admsn_prdmsn", "t_prdmsn_atncn", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc", "prmtro_brql"];
it("keeps all 38 unique source aliases in order and valid defaults", () => {
  expect(triageColumns.map(({ id }) => id)).toEqual(ids);
  expect(triageExportColumns.map(({ id }) => id)).toEqual(ids);
  expect(new Set(ids).size).toBe(38);
  expect(new Set(defaultVisibleColumns).size).toBe(defaultVisibleColumns.length);
  for (const id of defaultVisibleColumns) expect(ids).toContain(id);
});
it("uses only ISO birth dates as dates and preserves source timestamps and identifiers as text", () => {
  const numeric = ids.slice(25);
  for (const column of triageExportColumns) {
    expect(column.type).toBe(numeric.includes(column.id) ? "number" : column.id === "fcha_ncmnto" ? "date" : "text");
  }
  const row = { nmro_idntfccn: "00123", nmro_idntfccn_profesional: "00456", cnsctvo_trgge: "0007", cnsctvo_admsns: "0008", edd: "02", fcha_ncmnto: "2024-01-02", fcha_ingrso: "10/11/2026 00:02:31", fcha_trge: "10/11/2026 00:03:31", fcha_admsn: "10/11/2026 00:04:31", fcha_atncn: "10/11/2026 00:05:31", t_prdmsn_trgge: 11000 } as Triage;
  render(<>{triageColumns.map((column) => <div key={column.id}>{column.cell(row)}</div>)}</>);
  for (const text of ["00123", "00456", "0007", "0008", "02", "02/01/2024", row.fcha_ingrso, row.fcha_trge, row.fcha_admsn, row.fcha_atncn, "11.000"]) expect(screen.getByText(String(text))).toBeVisible();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});
