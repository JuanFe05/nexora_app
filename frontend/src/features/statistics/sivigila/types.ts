import type { ReportCell } from "../shared/types";

export const SIVIGILA_EVENTS = ["general", "ira", "eda", "dengue", "varicela", "rabia"] as const;
export type SivigilaEvent = (typeof SIVIGILA_EVENTS)[number];

export const SIVIGILA_COLUMN_KEYS = [
  "sede", "servicio", "tipo_documento", "no_documento", "empresa", "sexo", "nombre_completo",
  "fecha_nacimiento", "fecha_atencion", "edad", "tipo_edad", "grupo", "dx_principal",
  "desc_dx_principal", "dx_relacionado_uno", "desc_dx_relacionado_uno", "dx_relacionado_dos",
  "desc_dx_relacionado_dos", "medico", "especialidad",
] as const;
export type SivigilaColumnKey = (typeof SIVIGILA_COLUMN_KEYS)[number];
export type SivigilaRecord = Record<SivigilaColumnKey, ReportCell>;

export type AnalysisRow = { etiqueta: string; valores: number[]; total: number };
export type AnalysisTable = { titulo: string; columnas: string[]; filas: AnalysisRow[] };
export type SivigilaReport = {
  titulo: string;
  subtitulo: string;
  semana: number;
  periodo: number;
  anio: number;
  ira: AnalysisTable;
  eda: AnalysisTable;
  pestanas: Record<SivigilaEvent, SivigilaRecord[]>;
  advertencias: string[];
  total_registros: number;
};
