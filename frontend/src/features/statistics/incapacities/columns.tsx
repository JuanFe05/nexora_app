import type { DataTableColumn } from "@/components/shared/data-table";
import type { ExportColumn } from "@/lib/table-export";
import type { ReportCell } from "../shared/types";

// Mirror the API catalog. The API already formats dates and applies the report's equivalences.
const catalog = [
  ["tipo_idntfccn", "Tipo de identificación", "text"],
  ["nmro_idntfccn", "Identificación", "text"],
  ["prmr_nmbre", "Primer nombre", "text"],
  ["sgndo_nmbre", "Segundo nombre", "text"],
  ["prmr_aplldo", "Primer apellido", "text"],
  ["sgndo_aplldo", "Segundo apellido", "text"],
  ["empresa", "Empresa", "text"],
  ["fcha_atncn", "Fecha de solicitud", "date"],
  ["idntfccn_sde", "Código IPS", "text"],
  ["sede", "Descripción IPS", "text"],
  ["fcha_incpcdd", "Fecha de inicio", "date"],
  ["fcha_fin_incpcdd", "Fecha de fin", "date"],
  ["ds_incpcdd", "Duración", "number"],
  ["prrga", "Prórroga", "text"],
  ["Contingencia", "Origen de la patología", "text"],
  ["tpo_idntfccn_prfsnl", "Tipo de identificación médico", "text"],
  ["idntfccn_prfsnl", "Número de identificación del médico", "text"],
  ["rgstro_mdco", "Número del registro médico", "text"],
  ["nombre_medico", "Nombre del médico", "text"],
  ["especialidad", "Especialidad del médico", "text"],
  ["fecha_probable_parto", "Fecha probable de parto", "text"],
  ["fecha_probable_nacimiento", "Fecha probable de nacimiento", "text"],
  ["cdgo_dgnstco", "Código del diagnóstico", "text"],
  ["diagnostico", "Descripción del diagnóstico", "text"],
  ["lateralidad", "Lateralidad", "text"],
  ["clse_atencn", "Modalidad de atención", "text"],
  ["estado_incapacidad", "Estado de la incapacidad", "text"],
  ["cnsctvo_incpcdds", "Número de la solicitud", "text"],
] as const;

export type Incapacity = Record<(typeof catalog)[number][0], ReportCell>;

export const columns: (DataTableColumn<Incapacity> & { label: string })[] = catalog.map(([id, label, type]) => ({
  id,
  label,
  header: label,
  className: type === "number" ? "text-right! tabular-nums" : undefined,
  cell: (row) => {
    const text = String(row[id] ?? "");
    return <span className="block max-w-72 truncate" title={text}>{text}</span>;
  },
}));

export const exportColumns: ExportColumn[] = catalog.map(([id, , type]) => ({ id, type }));
