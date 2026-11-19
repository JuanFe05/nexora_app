import { createReportColumns, reportExportColumns, type ColumnType } from "../shared/report-columns";
import type { TriageColumnKey } from "./types";

/** All 38 aliases in source order. Only birth dates are ISO; timestamps stay text. */
const definitions = [
  ["sede", "Sede", "text"],
  ["cnsctvo_trgge", "Consecutivo de triaje", "text"],
  ["cnsctvo_admsns", "Consecutivo de admisión", "text"],
  ["estdo_admsn", "Estado de la admisión", "text"],
  ["cdgo_tpo_dcmnto", "Tipo de documento", "text"],
  ["nmro_idntfccn", "Número de identificación", "text"],
  ["prmr_nmbre", "Primer nombre", "text"],
  ["sgndo_nmbre", "Segundo nombre", "text"],
  ["prmr_aplldo", "Primer apellido", "text"],
  ["sgndo_aplldo", "Segundo apellido", "text"],
  ["edd", "Edad", "text"],
  ["tipo_edd", "Tipo de edad", "text"],
  ["fcha_ncmnto", "Fecha de nacimiento", "date"],
  ["sexo", "Sexo", "text"],
  ["empresa", "Empresa", "text"],
  ["tpo_empresa", "Tipo de empresa", "text"],
  ["tpo_idntfccn_profesional", "Tipo de identificación del profesional", "text"],
  ["nmro_idntfccn_profesional", "Número de identificación del profesional", "text"],
  ["profesional_salud", "Profesional de salud", "text"],
  ["cdgo", "Código de triaje", "text"],
  ["estdo_rgstro", "Estado del registro", "text"],
  ["fcha_ingrso", "Fecha de ingreso", "text"],
  ["fcha_trge", "Fecha de triaje", "text"],
  ["fcha_admsn", "Fecha de admisión", "text"],
  ["fcha_atncn", "Fecha de atención", "text"],
  ["t_prdmsn_trgge", "Tiempo preadmisión a triaje (min)", "number"],
  ["t_trgge_admsn", "Tiempo triaje a admisión (min)", "number"],
  ["t_admsn_prdmsn", "Tiempo admisión a atención (min)", "number"],
  ["t_prdmsn_atncn", "Tiempo preadmisión a atención (min)", "number"],
  ["tnsn_artrl_alta", "Tensión arterial alta", "number"],
  ["tnsn_artrl_bja", "Tensión arterial baja", "number"],
  ["frcnca_crdca", "Frecuencia cardíaca", "number"],
  ["frcnca_rsprtra", "Frecuencia respiratoria", "number"],
  ["tmprtra", "Temperatura", "number"],
  ["pso", "Peso", "number"],
  ["tlla", "Talla", "number"],
  ["imc", "IMC", "number"],
  ["prmtro_brql", "Perímetro braquial", "number"],
] as const satisfies readonly (readonly [TriageColumnKey, string, ColumnType])[];

export const defaultVisibleColumns: TriageColumnKey[] = [
  "sede", "cnsctvo_trgge", "cnsctvo_admsns", "cdgo_tpo_dcmnto", "nmro_idntfccn", "prmr_nmbre", "prmr_aplldo", "edd", "empresa", "cdgo", "fcha_ingrso", "fcha_trge", "fcha_admsn", "fcha_atncn", "t_prdmsn_atncn",
];
export const triageColumns = createReportColumns<TriageColumnKey>(definitions);
export const triageExportColumns = reportExportColumns(triageColumns);
