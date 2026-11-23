import type { GeneralBilling } from "../general-billing/types";

/** Consumo omite las cuatro columnas de relación/remisión de Facturación General. */
export type ExcludedConsumptionColumn = "cnsctvo_fctra_agrpda" | "no_remision" | "fcha_rmsn" | "no_envio";
export type GeneralConsumptionRow = Omit<GeneralBilling, ExcludedConsumptionColumn>;
export type ConsumptionIndicator = { clave: string; etiqueta: string; valor: number };
export type GeneralConsumptionReport = {
  indicadores: ConsumptionIndicator[];
  facturas: GeneralConsumptionRow[];
  admisiones: GeneralConsumptionRow[];
  advertencias: string[];
  total_facturas: number;
  total_admisiones: number;
};
