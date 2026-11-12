import { createReportColumns, reportExportColumns, type ColumnType } from "../shared/report-columns";
import type { VitalSignColumnKey } from "./types";

/** All 36 API aliases in source order; identifiers and phone numbers remain text. */
const definitions = [
  ["sede", "Sede", "text"],
  ["linea_servicio", "Línea de servicio", "text"],
  ["tipo_documento", "Tipo de documento", "text"],
  ["nmro_idntfccn", "Número de identificación", "text"],
  ["empresa", "Empresa", "text"],
  ["emprsa_rgmen", "Empresa del régimen", "text"],
  ["rgmen", "Régimen", "text"],
  ["gener", "Género", "text"],
  ["prmr_nmbre", "Primer nombre", "text"],
  ["sgndo_nmbre", "Segundo nombre", "text"],
  ["prmr_aplldo", "Primer apellido", "text"],
  ["sgndo_aplldo", "Segundo apellido", "text"],
  ["fcha_ncmnto", "Fecha de nacimiento", "date"],
  ["fcha_atncn", "Fecha de atención", "date"],
  ["edad", "Edad", "number"],
  ["tipo_edad", "Tipo de edad", "text"],
  ["direccion", "Dirección", "longtext"],
  ["mncpo_rsdncia", "Municipio de residencia", "text"],
  ["teléfono", "Teléfono", "text"],
  ["tnsn_artrl_alta", "Tensión arterial alta", "number"],
  ["tnsn_artrl_bja", "Tensión arterial baja", "number"],
  ["frcnca_crdca", "Frecuencia cardíaca", "number"],
  ["frcnca_rsprtra", "Frecuencia respiratoria", "number"],
  ["tmprtra", "Temperatura", "number"],
  ["pso", "Peso", "number"],
  ["tlla", "Talla", "number"],
  ["imc", "IMC", "number"],
  ["prmtro_crnl", "Perímetro craneal", "number"],
  ["cdgo_dgnstco", "Código de diagnóstico", "text"],
  ["diagnostico", "Diagnóstico", "longtext"],
  ["cdgo_dgnstco_rl_1", "Código de diagnóstico relacionado 1", "text"],
  ["diagnostico_rl_1", "Diagnóstico relacionado 1", "longtext"],
  ["cdgo_dgnstco_rl_2", "Código de diagnóstico relacionado 2", "text"],
  ["diagnostico_rl_2", "Diagnóstico relacionado 2", "longtext"],
  ["profesional_salud", "Profesional de salud", "text"],
  ["especialidad", "Especialidad", "text"],
] as const satisfies readonly (readonly [VitalSignColumnKey, string, ColumnType])[];

export const defaultVisibleColumns: VitalSignColumnKey[] = [
  "sede", "linea_servicio", "empresa", "fcha_atncn", "tipo_documento", "nmro_idntfccn", "prmr_nmbre", "prmr_aplldo", "edad", "tnsn_artrl_alta", "tnsn_artrl_bja", "frcnca_crdca", "frcnca_rsprtra", "tmprtra", "pso", "tlla", "imc", "cdgo_dgnstco", "profesional_salud",
];
export const vitalSignsColumns = createReportColumns<VitalSignColumnKey>(definitions);
export const vitalSignsExportColumns = reportExportColumns(vitalSignsColumns);
