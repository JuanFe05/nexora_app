import { createReportColumns } from "../shared/report-columns";

export const qualitySurveyColumns = createReportColumns([
  ["sede", "Sede", "text"],
  ["cdgo_tpo_dcmnto", "Tipo Id. Paciente", "text"],
  ["cc_afldo", "Número Id. Paciente", "text"],
  ["nombre_completo", "Nombre", "text"],
  ["genero", "Sexo", "text"],
  ["tlfno_afldo", "Teléfono", "text"],
  ["emprs", "Empresa", "text"],
  ["prfsnl_salud_rlza", "Profesional Realiza", "text"],
  ["cdgo_prcdmnto", "CUPS Servicio", "text"],
  ["procedimiento", "Servicio", "text"],
  ["lna_prdcto", "Tipo Servicio", "text"],
] as const);
