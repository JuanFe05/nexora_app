import { describe, expect, it } from "vitest";
import { groupPermissionOptions } from "./permission-grid";

describe("catalog module grouping", () => {
  it("sorts modules and preserves permission order, identity and original data", () => {
    const options = [
      { id: "1", codigo: "ventas.crear", nombre: "Crear ventas", modulo: "Ventas", descripcion: null },
      { id: "2", codigo: "caja.ver", nombre: "Ver caja", modulo: "Caja", descripcion: "Consulta" },
      { id: "3", codigo: "ventas.ver", nombre: "Ver ventas", modulo: "Ventas", descripcion: null },
    ];
    expect(groupPermissionOptions(options)).toEqual([["Caja", [options[1]]], ["Ventas", [options[0], options[2]]]]);
    expect(groupPermissionOptions(options)[1][1][0]).toBe(options[0]);
    expect(options.map(option => option.id)).toEqual(["1", "2", "3"]);
  });
  it("does not invent modules for an empty catalog", () => {
    expect(groupPermissionOptions([])).toEqual([]);
  });
});
