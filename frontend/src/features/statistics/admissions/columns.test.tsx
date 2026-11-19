// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { admissionsColumns, admissionsExportColumns, defaultVisibleColumns } from "./columns";
import type { Admission } from "./types";
afterEach(cleanup);
const ids = ["cnsctvo_trgge", "cnsctvo_admsn", "sede", "emprsa", "tpo_idntfccn", "nmro_idntfccn", "prmr_nmbre", "sgndo_nmbre", "prmr_aplldo", "sgndo_aplldo", "edd", "tlfno", "fcha_ncmnto", "sexo", "rza", "drccn", "mncpo_rsdncia", "tpo_idntfccn_prfsnl_ordna", "nmro_idntfccn_prfsnl_ordna", "prfsnl_ordna", "prfsnl_rlza", "cd_dx", "dx", "cd_dx_rlcndo1", "dx_rlcndo1", "cd_dx_rlcndo2", "dx_rlcndo2", "fcha_admsn", "fcha_slda_admsn", "fcha_ordn", "fcha_atncn2", "cnsctvo_dcto", "fcha_dcto", "cnsctvo_ordn_smntro_admsn", "cdgo_prcdmnto", "rslcn", "prcdmnto", "lna_prdcto", "cntdd", "vlr_srvco", "vlr_ttl", "vlr_srvcs", "vlr_smnstrs", "vlr_hnrrio", "fcha_atrzcn_eps", "nmro_atrzcn_eps", "estdo_admsn", "estdo_trnsccn", "estdo_srvcs", "usro_rlza", "usro_mdfccn", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc"];
it("keeps the 59 unique source aliases in order with valid defaults", () => {
  expect(admissionsColumns.map(({ id }) => id)).toEqual(ids);
  expect(new Set(ids).size).toBe(59);
  expect(admissionsExportColumns.map(({ id }) => id)).toEqual(ids);
  for (const id of defaultVisibleColumns) expect(ids).toContain(id);
});
it("assigns export types and renders dates, money and text preserving zeros", () => {
  const dates = ["fcha_ncmnto", "fcha_slda_admsn", "fcha_admsn", "fcha_ordn", "fcha_atncn2", "fcha_dcto", "fcha_atrzcn_eps"];
  const numeric = ["cntdd", "vlr_srvco", "vlr_ttl", "vlr_srvcs", "vlr_smnstrs", "vlr_hnrrio", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc"];
  for (const column of admissionsExportColumns) {
    expect(column.type).toBe(numeric.includes(column.id) ? "number" : dates.includes(column.id) ? "date" : "text");
  }
  const row = { nmro_idntfccn: "00123", tlfno: "000456", fcha_admsn: "2026-11-10 00:02:31", vlr_ttl: 11000, fcha_slda_admsn: "", edd: "28 Años", prcdmnto: "Descripción ficticia" } as Admission;
  render(<>{admissionsColumns.map((column) => <div key={column.id}>{column.cell(row)}</div>)}</>);
  for (const text of ["00123", "000456", "10/11/2026", "11.000", "28 Años"]) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByTitle("Descripción ficticia")).toHaveClass("truncate");
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});
