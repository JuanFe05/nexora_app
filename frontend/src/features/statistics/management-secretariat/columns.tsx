import { createReportColumns, reportExportColumns, type ColumnType } from "../shared/report-columns";

const definitions = [
  ["sede", "Sede", "text"], ["emprs", "Empresa", "text"], ["nmro_dcto", "No. Transacción / No. Documento / No. Admisión", "text"],
  ["factura", "Factura", "text"], ["fcha_dcto", "Fecha Factura", "date"], ["lna_prdcto", "Tipo Atención / Servicio", "text"],
  ["admision", "No. Admisión", "text"], ["cdgo_prcdmnto", "Código (Interno / CUPS)", "text"], ["rslcn", "Código (CUMS)", "text"],
  ["procedimiento", "Descripción Servicio / Procedimiento", "longtext"], ["cdgo_tpo_dcmnto", "Tipo Id. Paciente", "text"], ["cc_afldo", "Número Id. Paciente", "text"],
  ["nombre_completo", "Nombre Paciente", "text"], ["fcha_ingrso_pcnte", "F. Ingreso Paciente", "date"], ["fcha_egreso", "F. Egreso Paciente", "date"],
  ["prfsnl_salud_ordn", "Nombre Médico Ordena", "text"], ["prfsnl_salud_rlza", "Nombre Médico Realiza", "text"], ["cdgo_dgnstco", "Cod. Dx", "text"],
  ["dscrpcn_dgnstco", "Descripción DX (CIE10)", "longtext"], ["vlr_srvcs", "Valor Servicios", "money"], ["vlr_smnstrs", "Valor Suministros", "money"],
  ["cntdd", "Cantidad", "number"], ["vlr_untro", "Valor Unitario", "money"], ["cntdd1", "Cantidad * Vlr. Unitario", "money"],
  ["total_cntdd1", "Vlr. Total Servicios / Suministros", "money"], ["vlr_copago", "Vlr. Copago & Cuota Moderadora", "money"], ["pago_tpo1", "Pago Particular", "money"],
  ["pago_tpo2", "Descuento", "money"], ["usrio_mdfca", "Asesor / Facturador", "text"], ["nmro_atrzcn_eps", "Autorización", "text"], ["mes_dcto", "Nombre Mes", "text"],
] as const satisfies readonly (readonly [string, string, ColumnType])[];

type Key = (typeof definitions)[number][0];
export type ManagementSecretariatRow = Record<Key, string | number | null>;
export const managementSecretariatColumns = createReportColumns(definitions);
export const managementSecretariatExportColumns = reportExportColumns(managementSecretariatColumns);
export const managementSecretariatVisibleColumns = definitions.map(([key]) => key);
