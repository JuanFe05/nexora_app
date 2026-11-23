import { expect, it } from "vitest";
import { generalBillingColumns, generalBillingExportColumns } from "../general-billing/columns";
import { generalConsumptionColumns, generalConsumptionExportColumns } from "./columns";

it("derives exactly the 40 unified columns in billing order without changing their labels or renderers", () => {
  const excluded = ["cnsctvo_fctra_agrpda", "no_remision", "fcha_rmsn", "no_envio"];
  expect(generalConsumptionColumns).toHaveLength(40);
  expect(generalConsumptionColumns).toEqual(generalBillingColumns.filter(({ id }) => !excluded.includes(id)));
  for (const column of generalConsumptionColumns) expect(column.cell).toBe(generalBillingColumns.find(({ id }) => id === column.id)?.cell);
  expect(generalConsumptionExportColumns).toEqual(generalBillingExportColumns.filter(({ id }) => !excluded.includes(id)));
  expect(generalBillingColumns).toHaveLength(44);
});
