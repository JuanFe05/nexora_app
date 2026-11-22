import { createReportColumns, type ColumnType } from "../shared/report-columns";
import type { SivigilaColumnKey, SivigilaEvent } from "./types";

const definitions = [
  ["sede", "Sede", "text"],
  ["servicio", "Servicio", "text"],
  ["tipo_documento", "Tipo Documento", "text"],
  ["no_documento", "No. Documento", "text"],
  ["empresa", "Empresa", "text"],
  ["sexo", "Sexo", "text"],
  ["nombre_completo", "Nombre Completo", "text"],
  ["fecha_nacimiento", "Fecha Nacimiento", "date"],
  ["fecha_atencion", "Fecha Atencion", "date"],
  ["edad", "Edad", "number"],
  ["tipo_edad", "Tipo Edad", "text"],
  ["grupo", "Grupo", "text"],
  ["dx_principal", "DX Principal", "text"],
  ["desc_dx_principal", "Descripcion DX Principal", "longtext"],
  ["dx_relacionado_uno", "DX Relacionado Uno", "text"],
  ["desc_dx_relacionado_uno", "Descripcion DX Relacionado Uno", "longtext"],
  ["dx_relacionado_dos", "DX Relacionado Dos", "text"],
  ["desc_dx_relacionado_dos", "Descripcion DX Relacionado Dos", "longtext"],
  ["medico", "Médico", "text"],
  ["especialidad", "Especialidad", "text"],
] as const satisfies readonly (readonly [SivigilaColumnKey, string, ColumnType])[];

const GROUP_LABEL: Partial<Record<SivigilaEvent, string>> = { ira: "Grupo IRA", eda: "Grupo EDA" };

/** Las mismas 20 columnas en cada pestaña; solo cambia el encabezado del grupo (vacío en los eventos sin grupo). */
export function sivigilaColumns(event: SivigilaEvent) {
  return createReportColumns(definitions.map(([id, label, type]) => [id, id === "grupo" ? (GROUP_LABEL[event] ?? label) : label, type] as const));
}
