import { expect, it } from "vitest";
import { sivigilaColumns, sivigilaExportColumns } from "./columns";
import { SIVIGILA_COLUMN_KEYS, SIVIGILA_EVENTS } from "./types";

const headers = ["Sede", "Servicio", "Tipo Documento", "No. Documento", "Empresa", "Sexo", "Nombre Completo", "Fecha Nacimiento", "Fecha Atencion", "Edad", "Tipo Edad", "Grupo", "DX Principal", "Descripcion DX Principal", "DX Relacionado Uno", "Descripcion DX Relacionado Uno", "DX Relacionado Dos", "Descripcion DX Relacionado Dos", "Médico", "Especialidad"];

it.each(SIVIGILA_EVENTS)("keeps the 20 ordered headers and export columns for %s", (event) => {
  const expected = headers.map((header) => header === "Grupo" && (event === "ira" || event === "eda") ? `Grupo ${event.toUpperCase()}` : header);
  const columns = sivigilaColumns(event);
  expect(columns.map(({ header }) => header)).toEqual(expected);
  expect(columns.map(({ id }) => id)).toEqual(SIVIGILA_COLUMN_KEYS);
  expect(new Set(columns.map(({ id }) => id)).size).toBe(20);
  expect(sivigilaExportColumns(event)).toEqual(SIVIGILA_COLUMN_KEYS.map((id) => ({ id, type: id === "edad" ? "number" : ["fecha_nacimiento", "fecha_atencion"].includes(id) ? "date" : "text" })));
});
