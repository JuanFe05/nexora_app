# Modulo statistics

Informes de ESTADISTICA. Lee datos de SQL Server (fuente externa, solo lectura) mediante la
capacidad reutilizable `integration_management`; PostgreSQL sigue siendo la base principal y no
almacena los datos consultados.

## Informes disponibles

| Informe | Ruta frontend | Prefijo API | Permiso independiente |
| --- | --- | --- | --- |
| Facturas Detalladas | `/estadistica/informes/facturas-detalladas` | `/api/v1/statistics/reports/detailed-invoices` | `statistics.reports.detailed_invoices.view` |
| Signos Vitales | `/estadistica/informes/signos-vitales` | `/api/v1/statistics/reports/vital-signs` | `statistics.reports.vital_signs.view` |
| Admisiones (Urgencias) | `/estadistica/informes/admisiones` | `/api/v1/statistics/reports/admissions` | `statistics.reports.admissions.view` |
| Triaje (Urgencias) | `/estadistica/informes/triaje` | `/api/v1/statistics/reports/triage` | `statistics.reports.triage.view` |

Admisiones usa el periodo de **fecha de admision**, 59 columnas (alias de `Admisiones.sql`), los filtros
Sede, Empresa y Linea de Producto, paginacion con desempate estable y exportacion CSV/XLSX derivada del
mismo SQL (`queries/admissions.py`).

Triaje usa el periodo de **fecha de ingreso** (`pa.fcha_ingrso`, inclusivo), las 38 columnas de
`Triaje.sql` en el orden de la cabecera de `TRIAJE.csv`, filtros Sede (`s.unco`) y Empresa
(`emp.unco`, empresa efectiva de la admision o del afiliado), paginacion con desempate estable y
exportacion CSV/XLSX derivada del mismo SQL (`queries/triage.py`). No tiene relacion con Linea de
Producto: no muestra ni carga ese filtro y no enlaza `lineas` ni `filtrar_lineas` en SQL.
La fecha de nacimiento es ISO; las otras cuatro fechas conservan `dd/MM/yyyy HH:mm:ss` como texto,
los identificadores y la edad permanecen texto, y los tiempos y signos vitales son numericos.

Menus del sidebar sin vistas todavia, cada opcion con su permiso reservado (deshabilitada hasta tener ruta):

| Menu | Opcion | Permiso |
| --- | --- | --- |
| Resoluciones | Resolución 202 de 2021 | `statistics.resolutions.res_202_2021.view` |
| Resoluciones | Resolución 373 de 2026 | `statistics.resolutions.res_373_2026.view` |
| Resoluciones | Resolución 1552 de 2013 | `statistics.resolutions.res_1552_2013.view` |
| Resoluciones | Resolución 256 de 2016 | `statistics.resolutions.res_256_2016.view` |
| Resoluciones | Resolución 2175 de 2015 | `statistics.resolutions.res_2175_2015.view` |
| Circulares | Circular 06 de 2018 | `statistics.circulars.circular_06_2018.view` |
| Circulares | Circular 21 de 2026 | `statistics.circulars.circular_21_2026.view` |
| Gestion Administrativa | Consumo General | `statistics.administrative.general_consumption.view` |
| Gestion Administrativa | Facturación General | `statistics.administrative.general_billing.view` |
| Gestion Administrativa | Consumo de Laboratorio | `statistics.administrative.lab_consumption.view` |
| Gestion Administrativa | Gestión de Incapacidades | `statistics.administrative.disability_management.view` |
| Gestion Administrativa | Encuestas de Calidad | `statistics.administrative.quality_surveys.view` |
| Gestion Administrativa | Secretaría Gerencia | `statistics.administrative.management_secretariat.view` |

- Cada permiso se comprueba en backend en los cinco endpoints de su informe. Tener uno no
  permite consultar ni exportar el otro. Se siembra en el catalogo y solo se otorga a `ADMINISTRADOR`; los administradores lo
  asignan manualmente a roles. Pertenecer a `ESTADISTICA` no lo concede.
- La informacion incluye datos personales de pacientes: concederlo es una decision de acceso a
  datos sensibles.

### Contrato compartido

Los prefijos reutilizan las mismas rutas. Facturas Detalladas, Signos Vitales y Admisiones usan
`lineas` despues de Empresa, con ids reales de `tbLineasProductos.unco`; seleccionar todas equivale
a omitir el parametro. Triaje solo utiliza fechas, sedes y empresas: aunque la fabrica compartida
expone el catalogo y acepta `lineas`, su fuente lo ignora y nunca lo envia al ejecutor SQL.

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
- La fabrica HTTP registra las cinco rutas por prefijo y permiso. La exportacion de todos los
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

### Notificación SIVIGILA

Ruta frontend: `/estadistica/administrativa/notificacion-sivigila`.
API: `GET /api/v1/statistics/administrative/sivigila` (cliente: `/statistics/administrative/sivigila`),
con `fecha_inicial` y `fecha_final` obligatorias y filtros opcionales repetibles `sedes`,
`empresas` y `lineas`; los catálogos reutilizan `/filters/sites`, `/filters/companies` y
`/filters/product-lines`. Conserva el permiso existente `statistics.administrative.sivigila.view`.

Una sola consulta de `Signos_Vitales.sql` alimenta el pipeline Python de limpieza, normalización,
validación y clasificación y devuelve Análisis y todas las pestañas; cambiar de pestaña o paginar
localmente no vuelve a consultar. Las reglas proceden de `Grupos_Edades.bas` y `Grupos_DX.bas`
y se implementan en `domain/sivigila.py` y `application/sivigila.py`: los tres diagnósticos se
clasifican independientemente, sin duplicar una atención dentro de un evento, y General incluye
todas las atenciones. Meses/Días pertenecen a «Menor de 1 Año»; sexo no reconocido no se asigna
en el análisis por sexo.

Semana y periodo siguen `Notificaciones.bas`: la semana 1 empieza el primer domingo del año (una
fecha anterior pertenece a la última semana del año previo), periodo = `(semana-1) + 1`, año =
año de la fecha, formato `SEMANA 05 PERIODO 02 2026`. La fecha de referencia es la primera fecha
de atención de General (sin registros, `fecha_final`). El encabezado `NOTIFICACIÓN …` depende de
las sedes filtradas (FLORIDA VALLE DEL CAUCA, CORINTO CAUCA, MIRANDA CAUCA o GENERAL; sin
selección o con varios municipios = GENERAL; sedes fuera de la tabla de equivalencias no se
asignan a una ciudad); solo rotula, los datos siguen los filtros. Las tablas IRA y EDA reproducen
`NotificacionIRA.bas` y `NotificacionEDA.bas` (conteo por grupo de edad, por sexo F/M en EDA).

Exportación (solo desde la pestaña Análisis, sin nueva consulta a SQL Server; el cliente envía el
resultado ya procesado):

- `POST /statistics/administrative/sivigila/export/pdf`: PDF real (`infrastructure/sivigila_pdf.py`),
  Carta horizontal, una página, solo las tablas de Análisis, centrado en ambos ejes, encabezados
  azules sobre fondo blanco, tamaños de letra y columnas autoajustados.
- `POST /statistics/administrative/sivigila/export/xlsx`: un libro con siete hojas (Análisis,
  General, Evento IRA, Evento EDA, Dengue, Varicela, Exposición Rábica), con fechas reales,
  anchos, bordes y encabezados (`infrastructure/sivigila_workbook.py`).
