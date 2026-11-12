import type { MultiSelectValue } from "@/components/shared/multi-select";
import { ApiError } from "@/lib/http/api-error";
import type { CatalogOption } from "./types";

/** A complete or empty selection means unrestricted; only real catalog ids may leave this boundary. */
export function restrictedIds(selected: MultiSelectValue[], catalog: CatalogOption[]) {
  const ids = catalog
    .filter((option) => selected.includes(option.id))
    .map((option) => option.id);
  return ids.length === catalog.length ? [] : ids;
}
export function reportError(error: Error) {
  if (error instanceof ApiError && (error.status === 502 || error.status === 503))
    return "No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo.";
  if (error instanceof ApiError && error.status === 422)
    return "Revisa el período seleccionado. La fecha inicial no puede ser posterior a la fecha final.";
  return "No se pudo consultar el informe. Intenta de nuevo.";
}
