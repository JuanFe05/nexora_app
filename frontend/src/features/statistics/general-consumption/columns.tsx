import type { ReactNode } from "react";
import { defaultVisibleColumns, generalBillingColumns, generalBillingExportColumns } from "../general-billing/columns";
import type { ExcludedConsumptionColumn, GeneralConsumptionRow } from "./types";

const excluded: readonly ExcludedConsumptionColumn[] = ["cnsctvo_fctra_agrpda", "no_remision", "fcha_rmsn", "no_envio"];
const included = ({ id }: { id: string }) => !excluded.some((key) => key === id);

/** Cada renderizador solo lee su propia clave: al excluir esas columnas no necesita las cuatro claves ausentes. */
export const generalConsumptionColumns = generalBillingColumns.filter(included).map((column) => ({
  ...column,
  cell: column.cell as (row: GeneralConsumptionRow) => ReactNode,
}));
export const generalConsumptionExportColumns = generalBillingExportColumns.filter(included);
export const defaultConsumptionColumns = defaultVisibleColumns.filter((id) => included({ id }));
