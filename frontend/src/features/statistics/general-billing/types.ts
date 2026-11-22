import type { ReportFilters, ReportCell } from "../shared/types";
export type { CatalogOption } from "../shared/types";
export type GeneralBillingFilters = ReportFilters;
export type GeneralBillingColumnKey =
  | "sede" | "emprs" | "prfjo_dcto" | "cnsctvo_dcto" | "dscrp_transcn"
  | "fcha_dcto" | "pnto_atncn" | "lna_prdcto" | "admision" | "cdgo_prcdmnto"
  | "rslcn" | "procedimiento" | "cdgo_tpo_dcmnto" | "cc_afldo" | "nombre_completo"
  | "fcha_ncmnto" | "edad" | "tipo_edad" | "grupo_etario" | "genero"
  | "mncpo_rsdncia" | "drccn" | "fcha_ingrso_pcnte" | "fcha_egreso"
  | "prfsnl_salud_ordn" | "prfsnl_salud_rlza" | "cdgo_dgnstco" | "dscrpcn_dgnstco"
  | "vlr_srvcs" | "vlr_smnstrs" | "cntdd" | "vlr_untro" | "cntdd1" | "total_cntdd1"
  | "vlr_copago" | "pago_tpo1" | "pago_tpo2" | "usrio_mdfca" | "nmro_atrzcn_eps"
  | "cnsctvo_fctra_agrpda" | "no_remision" | "fcha_rmsn" | "no_envio" | "mes_dcto";
/** API aliases stay independent from presentation; identifiers are never coerced. */
export type GeneralBilling = Record<GeneralBillingColumnKey, ReportCell>;
