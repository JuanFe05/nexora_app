# Encuestas de Calidad

Prefijo: `/api/v1/statistics/administrative/quality-surveys`. Todas las rutas requieren
`statistics.administrative.quality_surveys.view`, independiente de Consumo General.

- `GET` al prefijo devuelve `{rows, total}`; si no hay coincidencias, `{ "rows": [], "total": 0 }`.
- `GET /filters/sites` y `GET /filters/companies` devuelven los catálogos compartidos en
  formato `[{id, nombre}]`.
- Consulta y descarga requieren `fecha_inicial` y `fecha_final` en formato ISO (límites
  inclusivos). Admiten `sedes` y `empresas` como parámetros enteros repetibles; omitir un
  parámetro no restringe ese catálogo. No existe filtro por línea de producto.
- `GET /export` requiere `formato=csv|xlsx` y uno o más `columnas=clave:tipo` en el
  orden deseado. Los tipos de los escritores compartidos son `text`, `number` y `date`;
  use `text` para las columnas del informe y para conservar ceros a la izquierda.
  Una selección inválida o duplicada devuelve 422 antes de consultar SQL. La descarga
  contiene solo las columnas seleccionadas; sin filas, conserva los encabezados. El CSV
  usa UTF-8 con BOM y separador punto y coma. No hay importación, exportación TXT ni PDF.

Ejemplo: `/export?fecha_inicial=2026-01-01&fecha_final=2026-01-31&formato=xlsx&columnas=nombre_completo:text&columnas=cdgo_prcdmnto:text`.

| Clave JSON / exportación | Encabezado |
| --- | --- |
| `sede` | Sede |
| `cdgo_tpo_dcmnto` | Tipo Id. Paciente |
| `cc_afldo` | Número Id. Paciente |
| `nombre_completo` | Nombre |
| `genero` | Sexo |
| `tlfno_afldo` | Teléfono |
| `emprs` | Empresa |
| `prfsnl_salud_rlza` | Profesional Realiza |
| `cdgo_prcdmnto` | CUPS Servicio |
| `procedimiento` | Servicio |
| `lna_prdcto` | Tipo Servicio |

La consulta y la descarga ejecutan las mismas consultas SQL existentes de Facturas Detalladas
y Admisiones en paralelo, con los mismos filtros. Se excluyen en cada fuente las filas cuya `lna_prdcto` sea `MEDICAMENTO` o
`MATERIAL - INSUMO MEDICO Qx` (ignorando mayúsculas y espacios); las filas incluidas conservan
el valor original de `lna_prdcto`. Primero se devuelven las facturas y luego las admisiones con
CUPS exactamente `890701`, sin deduplicar. En Admisiones se usa
`prfsnl_ordna` como Profesional Realiza. Para el nombre se recortan los cuatro componentes
y solo se unen los no vacíos, con un espacio entre ellos. Todos los campos se devuelven como
texto; los valores nulos se representan con una cadena vacía.

No se almacenan datos ni se cachean respuestas. La descarga vuelve a consultar: cambios en
SQL Server entre la visualización y la descarga pueden cambiar las filas. Si una fuente falla,
no se entrega un resultado parcial: el manejador existente responde 502 (consulta fallida) o
503 (fuente no disponible). El resultado filtrado reside en memoria durante la solicitud.
