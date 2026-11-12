# Modulo statistics

Informes de ESTADISTICA. Lee datos de SQL Server (fuente externa, solo lectura) mediante la
capacidad reutilizable `integration_management`; PostgreSQL sigue siendo la base principal y no
almacena los datos consultados.

## Informes disponibles

| Informe | Ruta frontend | Prefijo API | Permiso independiente |
| --- | --- | --- | --- |
| Facturas Detalladas | `/estadistica/informes/facturas-detalladas` | `/api/v1/statistics/reports/detailed-invoices` | `statistics.reports.detailed_invoices.view` |
| Signos Vitales | `/estadistica/informes/signos-vitales` | `/api/v1/statistics/reports/vital-signs` | `statistics.reports.vital_signs.view` |

- Cada permiso se comprueba en backend en los cinco endpoints de su informe. Tener uno no
  permite consultar ni exportar el otro. Se siembra en el catalogo y solo se otorga a `ADMINISTRADOR`; los administradores lo
  asignan manualmente a roles. Pertenecer a `ESTADISTICA` no lo concede.
- La informacion incluye datos personales de pacientes: concederlo es una decision de acceso a
  datos sensibles.

### Contrato compartido

Los dos prefijos exponen las mismas rutas y filtros. `lineas` sigue a Empresa y acepta ids
reales de `tbLineasProductos.unco`; seleccionar todas equivale a omitir el parametro.

| Endpoint (relativo al prefijo del informe) | Uso |
| --- | --- |
| `GET /filters/sites` | Catalogo de sedes (`tbSedes`) |
| `GET /filters/companies` | Catalogo de empresas (`tbEmpresas`) |
| `GET /filters/product-lines` | Catalogo de lineas de producto (`tbLineasProductos`), `[{id,nombre}]`, nombres recortados, sin filtro de estado |
| `GET /` | Informe: `fecha_inicial`, `fecha_final` (obligatorias, inclusivas), `sedes`, `empresas`, `lineas` (opcionales y repetibles; omitidas = sin restriccion), `limit` (1-100), `offset`. Cabecera `X-Total-Count` |
| `GET /export` | Exportacion en streaming de **todos** los registros del filtro (sin `limit`/`offset`): `formato` (`csv` o `xlsx`, uno por solicitud), `columnas` repetible como `id:tipo` (`text`, `number`, `date`) y los mismos filtros. Misma consulta y orden, sin `COUNT(*) OVER ()` ni paginacion |

Errores: 422 filtros invalidos, 503 fuente externa no configurada, 502 fallo al consultar.

### Consulta de Facturas Detalladas

Derivada de `FacturasDetalladas_V11.sql` (el original vive en `data_ips/`, ignorado por Git). Cambios:
fechas, sedes, empresas, lineas, `offset` y `limit` son parametros enlazados; `SET NOCOUNT ON`; se agregan
`total_registros` (`COUNT(*) OVER ()`) y un desempate por id de detalle para paginar de forma
estable; paginacion `OFFSET/FETCH`. CTE, `OUTER APPLY`, calculos y reglas se conservan. Solo
escribe en una variable de tabla (`@def`), nunca en tablas permanentes.

### Consulta de Signos Vitales

Incluida como constante en `queries/vital_signs.py`, derivada de `data_ips/Signos_Vitales.sql`:
el contenedor no depende de `data_ips`. Conserva las 36 columnas originales en orden, incluida
`teléfono`, y las reglas de historias cerradas y urgencias. Cambios acotados: `SET NOCOUNT ON`,
fechas enlazadas, filtros en el WHERE final sobre `s.unco`, `ae.unco_emprsa` y `lp.unco`,
`COUNT(*) OVER ()`, desempate `thc.unco` y `OFFSET/FETCH`. Conserva READ UNCOMMITTED y solo
inserta en las variables de tabla `@cerrado`, `@def`, `@esp`.

### Reutilizacion

- `ReportFilter` valida fechas y deduplica sedes, empresas y lineas; `DetailedInvoicesFilter`
  se mantiene como alias compatible.
- `Report` comparte validacion, pagina, exportacion y catalogos. `SqlServerReportSource`
  comparte parametros enlazados (lista `[-1]` cuando se omite un filtro), streaming y sondeo de
  total si la pagina esta fuera de rango. Cada informe aporta sus consultas nombradas.
- La fabrica HTTP registra las cinco rutas por prefijo y permiso. La exportacion de ambos
  informes se deriva con el mismo helper, sin el conteo ni la paginacion.
- `integration_management`: configuracion y motor de SQL Server, y ejecutor de consultas nombradas
  (`ReadOnlyQuery`) con parametros enlazados. No acepta SQL desde HTTP.
- Otros modulos (Gestion Administrativa, Resoluciones, Circulares) definen sus propias consultas,
  casos de uso, endpoints y permisos sobre ese ejecutor. Para compartir la misma informacion se
  expone un contrato explicito desde `statistics`; nunca se importa su infraestructura.

### Pendiente de verificar con SQL Server real

Nada de lo siguiente se ha ejecutado contra el servidor:

- Conexion, driver ODBC 18 y VPN.
- Que `tbTransaccionesServicios.unco` y `tbTransaccionesSuministros.unco` existan (desempate).
- Signos Vitales: compatibilidad del esquema (incluida la clave `tbHistoriasClinicas.unco`),
  resultados de filtros y rendimiento de las variables de tabla.
- Rendimiento: cada pagina vuelve a ejecutar la consulta completa; valorar acotar el rango de fechas.


### Lectura por bloques y conexiones

`SqlServerReadOnlyReader.stream` lee con `fetchmany` (bloques de 2000 filas): la conexion se abre al
iniciar la operacion y se cierra al terminar, fallar o cancelarse; el motor no usa pool (`NullPool`).
CSV se emite bloque a bloque; XLSX se escribe en un archivo temporal en disco (sin dependencias nuevas).
No existe tope artificial de registros.
