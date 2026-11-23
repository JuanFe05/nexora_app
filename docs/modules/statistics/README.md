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
| Consumo General | `/estadistica/administrativa/consumo-general` | `/api/v1/statistics/administrative/general-consumption` | `statistics.administrative.general_consumption.view` |

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

### Facturación General

API: `GET /api/v1/statistics/administrative/general-billing`, con permiso
`statistics.administrative.general_billing.view`. Fechas inicial/final obligatorias; filtros
opcionales repetibles Sede (`sedes`), Empresa (`empresas`) y Línea de producto (`lineas`),
en ese orden. Comparte los catálogos `/filters/*`, paginación `limit`/`offset` (1–100) y
`X-Total-Count`; `/export?formato=csv|xlsx` recibe `columnas=clave:tipo` repetible.
Las 44 claves, etiquetas exactas y tipos están en `application/general_billing.py:COLUMNS`:
exporta las etiquetas en el orden solicitado; los tipos de exportación son `text`, `number`
y `date` (metadatos `longtext` → `text`, `money` → `number`). Clave desconocida: 422,
incluso sin filas. Los demás informes conservan encabezados basados en sus claves.

Una sola lectura de la query de Facturas Detalladas alimenta el ETL; los datos llegan tipados
directamente de SQL Server (no se procesa ningún CSV). Las macros de `data_ips` son solo una guía
de las reglas: de `modProcesarFacturasDetalladas.bas` proceden el filtro CERRADO (facturas
electrónicas, agrupadas o TRANSACCION de los dos contratos SOS PGP) y la normalización a
mayúsculas con espacios colapsados; `modCalculoEdad.bas` inspira edad y curso de vida con
referencia en la fecha de factura, meses/años completos y ajuste al fin del mes;
`modCalculosFactura.bas` inspira nombre completo, mes en español, total, copago y pagos
particulares/descuentos: solo la primera fila retenida de cada factura lleva estos importes.
Fechas nativas o ISO e importes con punto decimal; nulos y valores defectuosos se normalizan a
vacío/0, edad inválida a null, y una fila defectuosa no interrumpe el informe. Se usan Decimal
e identificadores textuales, sin formato de miles.

Diferencias deliberadas respecto de las macros: clave `(prefijo, tipo documento, consecutivo)` para
no mezclar facturas, unidades `DÍAS`/`MESES`/`AÑOS`, una pasada por grupos contiguos y spool
privado temporal JSON Lines con índice `array('Q')`. Página y exportación reutilizan el mismo
resultado durante 60 segundos, con single-flight y máximo de 8 entradas por aplicación;
expirar, expulsar o cerrar elimina sus archivos (un export activo conserva su archivo hasta
cerrar su lector). La memoria del ETL está acotada por factura y la del índice a 8 bytes/fila.
No cambia Facturas Detalladas ni almacena resultados en PostgreSQL. La consulta y su
contigüidad/rendimiento aún deben verificarse contra SQL Server real.

### Consumo General

API: `/api/v1/statistics/administrative/general-consumption`. Permiso existente e independiente:
`statistics.administrative.general_consumption.view`, exigido en **todas** las rutas, incluidas
las exportaciones de Análisis. No existe `GET /columns`.

- `GET /filters/sites`, `/filters/companies`, `/filters/product-lines`: catálogos compartidos.
- `GET ""`: fechas inclusivas `fecha_inicial`, `fecha_final` obligatorias y filtros repetibles
  `sedes`, `empresas`, `lineas` opcionales. Responde `{indicadores, facturas, admisiones,
  advertencias, total_facturas, total_admisiones}` sin paginación; `indicadores` contiene los
  siete objetos `{clave, etiqueta, valor}` en orden: venta particular, copagos, cuotas
  moderadoras, copagos contributivo, cuotas contributivo, copagos subsidiado, cuotas subsidiado.
  Los valores COP y los importes de filas son números JSON, sin perder precisión Decimal.
- `GET /export?formato=csv|xlsx`: Facturas Detalladas **seguidas de** Admisiones y,
  con `ser_laboral_id` opcional, Ser Laboral al final; un solo
  encabezado y una misma hoja/CSV (el escritor compartido abre otra hoja únicamente al alcanzar
  el límite físico de Excel). Por defecto, las 40 columnas de Consumo en orden; `columnas` es
  opcional y repetible (`clave:text|number|date`) y conserva el orden solicitado. Encabezados
  legibles, BOM UTF-8 y separador `;` en CSV. Columnas desconocidas, tipos inválidos o duplicados:
  422 antes de consultar. Nunca incluye indicadores.
- `POST /export/analysis/pdf` y `POST /export/analysis/xlsx`: body
  `{ "indicadores": [{"clave": "total_venta_particular", "etiqueta": "Total Venta Particular",
  "valor": 12345}], "titulo": "CONSUMO GENERAL", "periodo": "ENERO 2026" }`.
  Solo indicadores (hasta siete), título/periodo opcionales; rechaza filas de detalle y campos
  adicionales con 422. PDF Carta horizontal y Excel de una sola hoja Análisis, estilos azules
  de SIVIGILA, importes COP con separadores de miles; no consultan SQL Server.

**Contrato corregido con `data_ips/Consumo General.docx`:** son **40 columnas**, no las 44 de
Facturación General: `application/general_consumption.py:COLUMNS` conserva sus claves, etiquetas
 y orden excepto `cnsctvo_fctra_agrpda`, `no_remision`, `fcha_rmsn`, `no_envio`.
Facturación General conserva intactas sus 44 columnas y comportamiento. La clave `usrio_mdfca`
(Asesor / Facturador) en Consumo procede de **`usrio_realiza`** en Facturas; en Admisiones procede
de `usro_mdfccn`.

Facturas usa `fila_cumple`: estado normalizado CERRADO, código distinto de 2/3 y documento distinto
de FACTURA AGRUPADA. En URGENCIAS exige empresa exactamente PARTICULAR o PARTICULAR FISIO NATURA;
en otros puntos exige admisión vacía/0. Solo las filas retenidas alimentan el ETL compartido
(`clean_record`, `process_chunks`, con predicado opcional cuyo valor por defecto sigue siendo el
de Facturación General), totales/pagos solo en la primera fila de la factura; edad y mes usan
`fcha_dcto`. Las fuentes SQL no procesan CSV ni macros; Ser Laboral tiene un importador independiente.

Admisiones no aplica `fila_cumple`. Mapea empresa `emprsa`, número de documento y admisión
`cnsctvo_admsn`, tipo de documento constante `ADMISION`, tipo de identificación `tpo_idntfccn`, fecha de documento e ingreso
`fcha_admsn`, salida `fcha_slda_admsn`, punto constante URGENCIAS y prefijo vacío. Nombre completo,
edad, unidad DÍAS/MESES/AÑOS, curso de vida y mes reutilizan Facturación General, con referencia
en `fcha_admsn`. Médicos `prfsnl_ordna`/`prfsnl_rlza`, Dx `cd_dx`/`dx`, procedimiento `prcdmnto`,
valor unitario `vlr_srvco`; copago/pago particular/descuento son 0. Otros campos disponibles
conservan su correspondencia natural; texto no disponible queda vacío.

**Importe por fila de Admisiones:** se utiliza **`vlr_ttl`**, porque la consulta real calcula
`CAST(det.cntdd * det.vlr_untro AS BIGINT)`: equivale exactamente al `cntdd1` de Facturas.
No se suma `vlr_srvco` (unitario) ni honorarios `vlr_hnrrio`. Un diccionario de totales y un
conjunto de admisiones consumidas asignan la suma solo a la primera fila de cada `cnsctvo_admsn`,
incluso con admisiones intercaladas; se preserva el orden estable de llegada SQL.

Análisis clasifica el copago procesado por el año de `fcha_dcto`: iguales a los importes de cuota
son cuotas moderadoras, el resto copagos; distingue las empresas exactas
`SOS PGP MIR Y COR CONTRIBUTIVO` y `SOS PGP MIR Y COR SUBSIDIADO`. La configuración dedicada
`configuration/general_consumption.py:MODERATOR_FEES` se inyecta al servicio: **2026 = 5000,
20100, 52800**. Una fila válida de otro año sin configuración produce 422:
`No hay cuotas moderadoras configuradas para la vigencia 2025.` (año correspondiente).
No extrapola cuotas; sin filas válidas no exige configuración. Fecha inválida en una factura
válida también produce 422 porque no permite determinar su vigencia.

Ambas fuentes SQL existentes reciben el mismo `ReportFilter` y se consumen simultáneamente con
`asyncio.gather`. Los bloques crudos pasan por archivos temporales privados que se cierran al
terminar/fallar/cancelar; ETL, pickle, JSON, CSV y construcción de archivos se descargan a
`asyncio.to_thread`. No hay cambios en SQL ni en PostgreSQL. Caché single-flight por filtro de
vida de aplicación, TTL activo de 60 segundos y máximo dos entradas, compartida entre consulta
y exportación; cierre elimina las entradas. El spool evita acumular los dos conjuntos crudos;
la respuesta completa calculada sí reside en memoria (contrato JSON sin paginación). Validar
memoria/rendimiento de volúmenes de producción y las dos conexiones concurrentes con SQL Server
real antes de desplegar.

#### Ser Laboral (CSV)

`POST /api/v1/statistics/administrative/general-consumption/ser-laboral` recibe bytes crudos
con `Content-Type: text/csv` (sin multipart). Lee el cuerpo incrementalmente y rechaza más de
25 MiB (25 × 1024 × 1024 bytes) con 413: `El archivo CSV excede el límite de 25 MB.`.
Respuesta 200: `{ser_laboral_id, filas, total, omitidas, advertencias}`; `filas` contiene las
mismas 40 claves e importes numéricos; `omitidas` cuenta las filas no CERRADO. Exige el mismo
permiso de Consumo General, no consulta SQL Server y no modifica Análisis.

Procesa con `csv.reader` sobre un stream decodificado, separador coma e índices resueltos una
sola vez, fuera del event loop (`asyncio.to_thread`). Admite UTF-8 con/sin BOM y, si falla la
validación UTF-8 incremental, cp1252 (también descarta BOM en esa variante). No usa las macros.
Solo `estado` trim/mayúsculas CERRADO; total por `cnsctvo_dcto` = suma exacta Decimal de
`cntdd * vlr_untro` de las filas retenidas, únicamente en la primera aparición aunque las
facturas estén intercaladas. Coma de miles y punto decimal (`10,500.00`, `1.00`); vacíos,
no numéricos y valores no finitos se vuelven 0. Fecha documento `dd/mm/yyyy`; ingreso/egreso
`m/d/yyyy h:mm:ss AM/PM`, sin depender del locale: salida ISO y fecha inválida vacía.

Cabeceras requeridas (las demás, incluidos `A?o`, `Textbox37`, `Textbox54`, `vlr_factrdo`,
se ignoran): `estado`, `sede`, `emprs`, `cnsctvo_dcto`, `dscrp_transcn`, `fcha_dcto`,
`pnto_atncn_atncn`, `lna_prdcto`, `cdgo_prcdmnto`, `procedimiento`, `cc_afldo`, `afldo`,
`genero`, `fcha_ingrso_pcnte`, `fcha_egrso_pcnte`, `prfsnl_salud_ordn`, `prfsnl_salud_rlza`,
`cntdd`, `vlr_untro`, `usrio_mdfca`, `nmro_atrzcn_eps`. Faltantes → 422
`Cabeceras requeridas faltantes: <lista>.`; duplicadas requeridas → 422. Sin filas CERRADO →
422 `Ningún registro cumple los filtros.`. CSV mal formado/indecodificable → 422.

Mapeo: `pnto_atncn_atncn` → `pnto_atncn`, `afldo` → `nombre_completo`,
`fcha_egrso_pcnte` → `fcha_egreso`; admisión constante `"0"`, mes español de `fcha_dcto`.
Sede/empresa/documento/tipo/línea/código/procedimiento/identificación/género/médicos/asesor/
autorización conservan su correspondencia natural, texto normalizado a mayúsculas/trim.
Prefijo, resolución, tipo identificación, nacimiento/edad/unidad/grupo, municipio/dirección
 y diagnóstico quedan vacíos. Servicios/suministros/copago/pago particular/descuento son 0.

Token opaco aleatorio (256 bits), caché en memoria de vida de aplicación: TTL fijo 30 minutos,
máximo 8 entradas; expulsa la carga más antigua. Expiración activa y comprobación monotónica;
el cierre del informe durante el apagado cancela timers y libera filas. Cargas inválidas no
alteran tokens existentes. No persiste archivos ni registros en PostgreSQL. Filas calculadas
residen en memoria por el contrato JSON; valorar memoria de ocho cargas de tamaño máximo.

`GET /export` con `ser_laboral_id` válido une Facturas + Admisiones + Ser Laboral en ese orden,
un solo encabezado, mismas columnas seleccionadas, una hoja (salvo límite físico de Excel).
Sin token conserva Facturas + Admisiones. Token desconocido/expirado/expulsado → 410 antes de
consultar SQL: `{"detail": "El archivo de Ser Laboral expiró; cárgalo de nuevo."}`.
La consulta general no invalida tokens de otros clientes; el frontend descarta su token al
reconsultar. Son tokens portadores: deben mantenerse privados como los datos del informe.

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
todas las atenciones. Solo se consideran atenciones cuya especialidad es «MEDICINA GENERAL» (sin distinguir mayúsculas); las demás se ignoran en todas las pestañas y tablas. Meses/Días pertenecen a «Menor de 1 Año»; sexo no reconocido no se asigna
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
