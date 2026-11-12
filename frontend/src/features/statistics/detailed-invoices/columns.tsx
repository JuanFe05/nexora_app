import type { DataTableColumn } from "@/components/shared/data-table";
import type { ExportColumn } from "@/lib/table-export";
import type { DetailedInvoice, InvoiceCell, InvoiceColumnKey } from "./types";

type ColumnType = "text" | "date" | "money" | "number" | "longtext" | "status";
const moneyFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 6,
});
function isEmpty(value: InvoiceCell | undefined) {
  return value == null || value === "";
}
export function formatDate(value: InvoiceCell | undefined) {
  if (isEmpty(value)) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?$/.exec(String(value));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}
function numericValue(
  value: InvoiceCell | undefined,
  formatter: Intl.NumberFormat,
) {
  if (isEmpty(value)) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? formatter.format(number) : "—";
}
export function formatMoney(value: InvoiceCell | undefined) {
  return numericValue(value, moneyFormatter);
}
export function formatNumber(value: InvoiceCell | undefined) {
  return numericValue(value, numberFormatter);
}

/** All 71 keys in the API contract, in source order. No patient data is persisted locally. */
const definitions = [
  ["sede", "Sede", "text"],
  ["emprs", "Empresa", "text"],
  ["pnto_atncn", "Punto de atención", "text"],
  ["pnto_atncn_atncn", "Punto de atención asistencial", "text"],
  ["dscrp_transcn", "Descripción de transacción", "longtext"],
  ["tpo_dcto", "Tipo de documento", "text"],
  ["prfjo_dcto", "Prefijo del documento", "text"],
  ["nmro_dcto", "Número de documento", "text"],
  ["cnsctvo_dcto", "Consecutivo del documento", "text"],
  ["no_remision", "Número de remisión", "text"],
  ["fcha_rmsn", "Fecha de remisión", "date"],
  ["unco_cnta_cbro", "Cuenta de cobro", "text"],
  ["no_envio", "Número de envío", "text"],
  ["cnsctvo_fctra_agrpda", "Consecutivo de factura agrupada", "text"],
  ["admision", "Admisión", "text"],
  ["fcha_dcto", "Fecha del documento", "date"],
  ["fcha_ingrso_pcnte", "Fecha de ingreso del paciente", "date"],
  ["fcha_egreso", "Fecha de egreso", "date"],
  ["estado", "Estado", "text"],
  ["cdgo_tpo_dcmnto", "Tipo de identificación", "text"],
  ["cc_afldo", "Identificación del afiliado", "text"],
  ["prmr_nmbre", "Primer nombre", "text"],
  ["sgndo_nmbre", "Segundo nombre", "text"],
  ["prmr_aplldo", "Primer apellido", "text"],
  ["sgndo_aplldo", "Segundo apellido", "text"],
  ["edd", "Edad", "number"],
  ["genero", "Género", "text"],
  ["tlfno_afldo", "Teléfono del afiliado", "text"],
  ["fcha_ncmnto", "Fecha de nacimiento", "date"],
  ["drccn", "Dirección", "longtext"],
  ["mncpo_rsdncia", "Municipio de residencia", "text"],
  ["tnsn_artrl_alta", "Tensión arterial alta", "number"],
  ["tnsn_artrl_bja", "Tensión arterial baja", "number"],
  ["frcnca_crdca", "Frecuencia cardíaca", "number"],
  ["frcnca_rsprtra", "Frecuencia respiratoria", "number"],
  ["tmprtra", "Temperatura", "number"],
  ["pso", "Peso", "number"],
  ["tlla", "Talla", "number"],
  ["imc", "IMC", "number"],
  ["prfsnl_salud_ordn", "Profesional que ordena", "text"],
  ["prfsnl_salud_rlza", "Profesional que realiza", "text"],
  ["cdgo_dgnstco", "Código de diagnóstico", "text"],
  ["dscrpcn_dgnstco", "Descripción del diagnóstico", "longtext"],
  ["cdgo_dgnstco_rlcndo1", "Código de diagnóstico relacionado 1", "text"],
  [
    "dscrpcn_dgnstco_rlcndo1",
    "Descripción del diagnóstico relacionado 1",
    "longtext",
  ],
  ["cdgo_dgnstco_rlcndo2", "Código de diagnóstico relacionado 2", "text"],
  [
    "dscrpcn_dgnstco_rlcndo2",
    "Descripción del diagnóstico relacionado 2",
    "longtext",
  ],
  ["lna_prdcto", "Línea de producto", "text"],
  ["cdgo_prcdmnto", "Código de procedimiento", "text"],
  ["rslcn", "Resolución", "text"],
  ["procedimiento", "Procedimiento", "longtext"],
  ["vlr_srvcs", "Valor de servicios", "money"],
  ["vlr_smnstrs", "Valor de suministros", "money"],
  ["cntdd", "Cantidad", "number"],
  ["vlr_untro", "Valor unitario", "money"],
  ["cntdd1", "Cantidad adicional", "number"],
  ["vlr_cnvno", "Valor del convenio", "money"],
  ["vlr_factrdo", "Valor facturado", "money"],
  ["usrio_realiza", "Usuario que realiza", "text"],
  ["usrio_mdfca", "Usuario que modifica", "text"],
  ["tpo_lqdcn_pcnte", "Tipo de liquidación del paciente", "text"],
  ["vlr_lqdd_pcnte", "Valor liquidado al paciente", "money"],
  ["estdo_pgo_pcnte", "Estado de pago del paciente", "status"],
  ["frma_pgo", "Forma de pago", "longtext"],
  ["vlr_frma_pgo_dtlle", "Detalle del valor por forma de pago", "longtext"],
  ["vlr_ttl_frmas_pgo", "Valor total de formas de pago", "money"],
  ["vlr_frmas_pgo_tpo1", "Valor de formas de pago tipo 1", "money"],
  ["vlr_frmas_pgo_tpo2", "Valor de formas de pago tipo 2", "money"],
  ["vlr_frmas_pgo_otro_tpo", "Valor de otras formas de pago", "money"],
  ["fcha_atrzcn_eps", "Fecha de autorización EPS", "date"],
  ["nmro_atrzcn_eps", "Número de autorización EPS", "text"],
] as const satisfies readonly (readonly [
  InvoiceColumnKey,
  string,
  ColumnType,
])[];

export const defaultVisibleColumns: InvoiceColumnKey[] = [
  "sede",
  "emprs",
  "nmro_dcto",
  "fcha_dcto",
  "dscrp_transcn",
  "estado",
  "cc_afldo",
  "prmr_nmbre",
  "prmr_aplldo",
  "procedimiento",
  "cntdd",
  "vlr_untro",
  "vlr_factrdo",
  "estdo_pgo_pcnte",
  "frma_pgo",
];

function renderCell(value: InvoiceCell | undefined, type: ColumnType) {
  if (type === "status") {
    if (isEmpty(value)) return null;
    return <span className="block max-w-72 whitespace-normal">{String(value)}</span>;
  }
  if (type === "date") return formatDate(value);
  if (type === "money") return formatMoney(value);
  if (type === "number") return formatNumber(value);
  const text = isEmpty(value) ? "—" : String(value);
  return (
    <span className="block max-w-72 truncate" title={text}>
      {text}
    </span>
  );
}
export const invoiceColumns: (DataTableColumn<DetailedInvoice> & {
  id: InvoiceColumnKey;
  label: string;
  type: ColumnType;
})[] = definitions.map(([id, label, type]) => ({
  id,
  label,
  header: label,
  type,
  className:
    type === "money" || type === "number"
      ? "text-right! tabular-nums whitespace-nowrap"
      : type === "date"
        ? "whitespace-nowrap"
        : undefined,
  cell: (row) => renderCell(row[id], type),
}));

export const invoiceExportColumns: ExportColumn[] = invoiceColumns.map(
  ({ id, type }) => ({
    id,
    type:
      type === "money" || type === "number"
        ? "number"
        : type === "date"
          ? "date"
          : "text",
  }),
);
