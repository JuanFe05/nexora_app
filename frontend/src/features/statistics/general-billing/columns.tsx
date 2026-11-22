import { createReportColumns, reportExportColumns, type ColumnType } from "../shared/report-columns";
import type { GeneralBillingColumnKey } from "./types";

/** S3: all 44 aliases in API order, with identifiers kept as text. */
const definitions = [
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
] as const satisfies readonly (readonly [GeneralBillingColumnKey, string, ColumnType])[];

export const defaultVisibleColumns: GeneralBillingColumnKey[] = [
  "sede", "emprs", "prfjo_dcto", "cnsctvo_dcto", "dscrp_transcn", "fcha_dcto", "pnto_atncn", "procedimiento", "nombre_completo", "vlr_srvcs", "vlr_smnstrs", "total_cntdd1", "vlr_copago", "pago_tpo1", "pago_tpo2",
];
export const generalBillingColumns = createReportColumns<GeneralBillingColumnKey>(definitions);
// The API owns file headers; keep their labels alongside the shared export type mapping.
export const generalBillingExportColumns = reportExportColumns(generalBillingColumns).map((column, index) => ({
  ...column,
  label: generalBillingColumns[index].label,
}));
