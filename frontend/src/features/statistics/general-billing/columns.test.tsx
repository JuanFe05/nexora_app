// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { generalBillingColumns, generalBillingExportColumns, defaultVisibleColumns } from "./columns";
import type { GeneralBilling } from "./types";
afterEach(cleanup);
const expected = [
  ["sede", "Sede", "text"],
  ["emprs", "Empresa", "text"],
  ["prfjo_dcto", "Prefijo Documento", "text"],
  ["cnsctvo_dcto", "No. Transacción / No. Documento / No. Admisión", "text"],
  ["dscrp_transcn", "Tipo Documento", "text"],
  ["fcha_dcto", "Fecha Factura", "date"],
  ["pnto_atncn", "Punto Atención / Servicio", "text"],
  ["lna_prdcto", "Tipo Atención / Servicio", "text"],
  ["admision", "No. Admisión", "text"],
  ["cdgo_prcdmnto", "Código (Interno / CUPS)", "text"],
  ["rslcn", "Código (CUMS)", "text"],
  ["procedimiento", "Descripción Servicio / Procedimiento", "longtext"],
  ["cdgo_tpo_dcmnto", "Tipo Id. Paciente", "text"],
  ["cc_afldo", "Número Id. Paciente", "text"],
  ["nombre_completo", "Nombre Paciente", "text"],
  ["fcha_ncmnto", "F. Nacimiento Paciente", "date"],
  ["edad", "Edad Paciente", "number"],
  ["tipo_edad", "Tipo Edad Paciente", "text"],
  ["grupo_etario", "Grupo Etario", "text"],
  ["genero", "Sexo Paciente", "text"],
  ["mncpo_rsdncia", "Municipio Residencia", "text"],
  ["drccn", "Dirección Residencia", "longtext"],
  ["fcha_ingrso_pcnte", "F. Ingreso Paciente", "date"],
  ["fcha_egreso", "F. Egreso Paciente", "date"],
  ["prfsnl_salud_ordn", "Nombre Médico Ordena", "text"],
  ["prfsnl_salud_rlza", "Nombre Médico Realiza", "text"],
  ["cdgo_dgnstco", "Cod. Dx", "text"],
  ["dscrpcn_dgnstco", "Descripción DX (CIE10)", "longtext"],
  ["vlr_srvcs", "Valor Servicios", "money"],
  ["vlr_smnstrs", "Valor Suministros", "money"],
  ["cntdd", "Cantidad", "number"],
  ["vlr_untro", "Valor Unitario", "money"],
  ["cntdd1", "Cantidad × Vlr. Unitario", "money"],
  ["total_cntdd1", "Vlr. Total Servicios / Suministros", "money"],
  ["vlr_copago", "Vlr. Copago & Cuota Moderadora", "money"],
  ["pago_tpo1", "Pago Particular", "money"],
  ["pago_tpo2", "Descuento", "money"],
  ["usrio_mdfca", "Asesor / Facturador", "text"],
  ["nmro_atrzcn_eps", "Autorización", "text"],
  ["cnsctvo_fctra_agrpda", "Relación Factura Agrupada", "text"],
  ["no_remision", "No. Remisión", "text"],
  ["fcha_rmsn", "Fecha Remisión", "date"],
  ["no_envio", "Relación de Envío", "text"],
  ["mes_dcto", "Nombre Mes", "text"],
] as const;
it("defines all 44 unique keys, exact Spanish headers and types in S3 order", () => {
  expect(generalBillingColumns.map(({ id, label, type }) => [id, label, type])).toEqual(expected);
  expect(generalBillingColumns.map(({ header }) => header)).toEqual(expected.map(([, label]) => label));
  expect(new Set(generalBillingColumns.map(({ id }) => id)).size).toBe(44);
  expect(generalBillingExportColumns).toEqual(expected.map(([id, label, type]) => ({ id, label, type: type === "money" || type === "number" ? "number" : type === "date" ? "date" : "text" })));
  expect(defaultVisibleColumns).toEqual(["sede", "emprs", "prfjo_dcto", "cnsctvo_dcto", "dscrp_transcn", "fcha_dcto", "pnto_atncn", "procedimiento", "nombre_completo", "vlr_srvcs", "vlr_smnstrs", "total_cntdd1", "vlr_copago", "pago_tpo1", "pago_tpo2"]);
});
it("preserves identifiers and formats dates, money and decimal quantities using shared cells", () => {
  const row = { cnsctvo_dcto: "000123", cc_afldo: "0012345678", fcha_dcto: "2026-01-02", vlr_srvcs: 1234567, cntdd: 2.5, procedimiento: "Servicio ficticio" } as GeneralBilling;
  render(<>{generalBillingColumns.map((column) => <div key={column.id}>{column.cell(row)}</div>)}</>);
  for (const text of ["000123", "0012345678", "02/01/2026", "1.234.567", "2,5"]) expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByTitle("Servicio ficticio")).toHaveClass("truncate", "max-w-72");
  expect(generalBillingColumns.find(({ id }) => id === "vlr_srvcs")?.className).toContain("tabular-nums");
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});
