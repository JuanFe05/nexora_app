import type { GeneralBilling } from "../general-billing/types";

/** Consumo omite las cuatro columnas de relación/remisión de Facturación General. */
export type ExcludedConsumptionColumn = "cnsctvo_fctra_agrpda" | "no_remision" | "fcha_rmsn" | "no_envio";
export type GeneralConsumptionRow = Omit<GeneralBilling, ExcludedConsumptionColumn>;
export type ConsumptionTable = "facturas" | "admisiones" | "ser_laboral";
export type ConsumptionIndicator = { clave: string; etiqueta: string; valor: number };
export type SerLaboralReport = {
  ser_laboral_id: string;
  filas: GeneralConsumptionRow[];
  total: number;
  omitidas: number;
  advertencias: string[];
};
export type GeneralConsumptionReport = {
  indicadores: ConsumptionIndicator[];
  facturas: GeneralConsumptionRow[];
  admisiones: GeneralConsumptionRow[];
  advertencias: string[];
  total_facturas: number;
  total_admisiones: number;
};
