import { createReportColumns, reportExportColumns } from "../shared/report-columns";
import type { AnnarRow, LabConsumptionRow } from "./types";
export const labColumns = createReportColumns<keyof LabConsumptionRow>([
  ["cnsctvo_dcto", "Transacción / Factura / Admisión", "text"],
  ["cdgo_prcdmnto", "CUPS", "text"],
  ["lna_prdcto", "Tipo Procedimiento", "text"],
  ["procedimiento", "Nombre Procedimiento", "longtext"],
  ["cntdd", "Cantidad", "number"],
  ["fcha_ingrso_pcnte", "Fecha Ingreso", "date"],
  ["fcha_dcto", "Fecha Factura", "date"],
  ["admision", "Admisión", "text"],
  ["estado", "Estado Documento", "text"],
  ["emprs", "Empresa", "text"],
  ["dscrp_transcn", "Tipo Documento", "text"],
  ["sede", "Sede", "text"],
]);
export const annarColumns = createReportColumns<keyof AnnarRow>([
  ["codigo_centro_costo", "Código Centro de Costo", "text"],
  ["nombre_centro_costos", "Nombre Centro de Costos", "text"],
  ["examen", "Examen", "text"],
  ["nombre_examen", "Nombre del Examen", "longtext"],
  ["cantidad", "Cantidad", "number"],
  ["empresa", "Empresa", "text"],
  ["punto_atencion", "Punto Atención", "text"],
]);
export const labExportColumns = reportExportColumns(labColumns).map((column, i) => ({ ...column, label: labColumns[i].label }));
export const annarExportColumns = reportExportColumns(annarColumns).map((column, i) => ({ ...column, label: annarColumns[i].label }));
export const defaultLabColumns = labColumns.map(({ id }) => id);
export const defaultAnnarColumns = annarColumns.map(({ id }) => id);
