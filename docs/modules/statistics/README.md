# Modulo statistics

Informes de ESTADISTICA. Lee datos de SQL Server (fuente externa, solo lectura) mediante la
capacidad reutilizable `integration_management`; PostgreSQL sigue siendo la base principal y no
almacena los datos consultados.

## Informes disponibles

- [Gestión de Incapacidades](incapacities.md): consulta directa, paginación y exportaciones CSV/XLSX.

| Informe | Ruta frontend | Prefijo API | Permiso independiente |
| --- | --- | --- | --- |
| Facturas Detalladas | `/estadistica/informes/facturas-detalladas` | `/api/v1/statistics/reports/detailed-invoices` | `statistics.reports.detailed_invoices.view` |
| Signos Vitales | `/estadistica/informes/signos-vitales` | `/api/v1/statistics/reports/vital-signs` | `statistics.reports.vital_signs.view` |
| Admisiones (Urgencias) | `/estadistica/informes/admisiones` | `/api/v1/statistics/reports/admissions` | `statistics.reports.admissions.view` |
| Triaje (Urgencias) | `/estadistica/informes/triaje` | `/api/v1/statistics/reports/triage` | `statistics.reports.triage.view` |
| Consumo General | `/estadistica/administrativa/consumo-general` | `/api/v1/statistics/administrative/general-consumption` | `statistics.administrative.general_consumption.view` |
| Consumo de Laboratorio | `/estadistica/administrativa/consumo-laboratorio` | `/api/v1/statistics/administrative/lab-consumption` | `statistics.administrative.lab_consumption.view` |

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
| Gestion Administrativa | Encuestas de Calidad | `statistics.administrative.quality_surveys.view` |
| Gestion Administrativa | Secretaría Gerencia | `statistics.administrative.management_secretariat.view` |

- Cada permiso se comprueba en backend en todos los endpoints de su informe. Tener uno no
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
- `GET /export?formato=csv|xlsx`: `tablas` opcional y repetible admite `facturas`,
  `admisiones`, `ser_laboral` (valor desconocido: 422). Solo escribe las tablas seleccionadas,
  sin duplicados y siempre en ese orden, independientemente del orden de la solicitud.
  Por ejemplo, `tablas=admisiones&tablas=facturas` exporta Facturas Detalladas y luego Admisiones.
  Omitir `tablas` conserva el comportamiento anterior: Facturas + Admisiones y, con
  `ser_laboral_id` opcional, Ser Laboral al final. Seleccionar explícitamente `ser_laboral`
  exige token: si falta, 422 `Carga el CSV de Ser Laboral para exportarlo.`; desconocido o
  expirado, 410. Si no se selecciona Ser Laboral, ignora `ser_laboral_id`. Exportar únicamente
  Ser Laboral no construye el informe ni consulta SQL Server o cuotas moderadoras. Si incluye
  Facturas o Admisiones, resuelve primero el token aplicable y después construye el informe;
  una vigencia sin cuotas sigue produciendo 422 antes de enviar cabeceras.
  Un solo encabezado y una misma hoja/CSV (el escritor compartido abre otra hoja únicamente
  al alcanzar el límite físico de Excel). Por defecto, las 40 columnas de Consumo en orden;
  `columnas` es opcional y repetible (`clave:text|number|date`) y conserva el orden solicitado.
  Encabezados legibles, BOM UTF-8 y separador `;` en CSV. Columnas desconocidas, tipos inválidos
  o duplicados: 422 antes de consultar. Nunca incluye indicadores.
  Nombre completo (sin `tablas` o con las tres): `consumo-general_<inicio>_<fin>.<ext>`.
  Para un subconjunto: `consumo-general-<tablas>_<inicio>_<fin>.<ext>`, con nombres
  `facturas-detalladas`, `admisiones`, `ser-laboral` unidos por guion en el orden fijo;
  por ejemplo, `consumo-general-facturas-detalladas-admisiones_2026-01-01_2026-01-31.csv`.
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
`SOS PGP MIR Y COR CONTRIBUTIVO` y `SOS PGP MIR Y COR SUBSIDIADO`. Las cuotas se administran
en Configuración → Cuotas Moderadoras y se leen desde PostgreSQL por vigencia. La migración
siembra **2026 = 5000, 20100, 52800**. Una fila válida de otro año sin configuración produce 422:
`No hay cuotas moderadoras configuradas para la vigencia 2025.` (año correspondiente).
No extrapola cuotas; sin filas válidas no exige configuración. Fecha inválida en una factura
válida también produce 422 porque no permite determinar su vigencia.

Ambas fuentes SQL existentes reciben el mismo `ReportFilter` y se consumen simultáneamente con
`asyncio.gather`. Los bloques crudos pasan por archivos temporales privados que se cierran al
terminar/fallar/cancelar; ETL, pickle, JSON, CSV y construcción de archivos se descargan a
`asyncio.to_thread`. No hay cambios en las consultas de SQL Server. Caché single-flight por
filtro de vida de aplicación, TTL activo de 60 segundos y máximo dos entradas, compartida entre
consulta y exportación. Cada operación lee una instantánea actual de cuotas con una sesión
PostgreSQL propia que se cierra al terminar; el singleton nunca retiene sesiones de petición.
La caché depende del contenido completo de esa instantánea: crear, editar o eliminar cuotas
invalida inmediatamente las entradas locales, incluso cuando escribe otro worker. El cierre
elimina las entradas. El spool evita acumular los dos conjuntos crudos;
la respuesta completa calculada sí reside en memoria (contrato JSON sin paginación). Validar
memoria/rendimiento de volúmenes de producción y las dos conexiones concurrentes con SQL Server
real antes de desplegar.

#### Cuotas moderadoras por vigencia

Configuración → Cuotas Moderadoras (`/configuracion/cuotas-moderadoras`). API bajo
`/api/v1/statistics/administrative/moderator-fees`:

| Método | Ruta relativa | Contrato | Permiso |
| --- | --- | --- | --- |
| GET | `""` | Lista por vigencia descendente | `statistics.administrative.moderator_fees.view` |
| PUT | `/{vigencia}` | Upsert `{ "importes": [5000, 20100, 52800] }`; responde 200 con la fila | `statistics.administrative.moderator_fees.manage` |
| DELETE | `/{vigencia}` | 204 sin cuerpo; 404 si no existe | `statistics.administrative.moderator_fees.manage` |

Fila de respuesta: `{ "vigencia": 2026, "importes": [5000, 20100, 52800],
"actualizado_por": "Nombre Apellido", "actualizado_en": "2026-01-01T00:00:00Z" }`.
Importes ordenados ascendentemente; `actualizado_por` es null para la siembra o si se elimina
el usuario (FK nullable con `ON DELETE SET NULL`). Cada PUT registra el usuario autenticado y
la fecha/hora UTC del cambio. Una sola fila PostgreSQL por año, en `statistics.cuota_moderadora`.
No se guardan datos clínicos en esa tabla.

Vigencia entera entre 2000 y 2100, inclusivos; entre 1 y 10 importes COP enteros estrictos,
únicos y entre 1 y 1.000.000. Se rechazan booleanos, decimales y cadenas numéricas. Los errores
son `{ "detail": "mensaje en español" }`: 422 para validación, 401 sin autenticación válida,
403 sin el permiso específico. Ver no permite escribir y administrar no concede ver.
Ambos permisos se siembran mediante el catálogo existente y se asignan a ADMINISTRADOR en el
bootstrap idempotente; los demás roles necesitan asignación explícita. El identificador técnico
del módulo del catálogo sigue siendo `statistics`, con nombres de permisos en español.

La revisión `0004_moderator_fees`, posterior a `0003_fix_statistics_perms`, crea tabla,
constraints, FK, función de unicidad y siembra 2026 con literales propios. El downgrade elimina
estos objetos y sus datos. Los tests del informe inyectan un puerto de instantáneas de cuotas,
no configuración estática. Las pruebas de migración PostgreSQL siguen el fixture de integración
de base **de pruebas**; nunca ejecutar migraciones de verificación contra bases no destinadas a tests.

La revisión posterior `0005_moderator_fees_limit` reemplaza únicamente el CHECK
`ck_cuota_moderadora_importes_validos` para reducir el máximo a 1.000.000 COP, conservando
las restricciones de dimensionalidad, cantidad, nulos y mínimo. El downgrade restaura
10.000.000 COP. No modifica la revisión histórica ni transforma datos: si existen importes
superiores a 1.000.000, PostgreSQL rechazará el upgrade; deben revisarse antes del despliegue.
Esta revisión se ha verificado solo mediante SQL offline, sin ejecutarla contra una base.

El formulario de creación/edición usa controles TailAdmin, con −/+ y flechas de teclado en
pasos de 1.000 COP limitados a los extremos, sin impedir escribir importes exactos. Muestra
miles `es-CO` al salir del campo y dígitos al enfocarlo, manteniendo enteros en la API.
La vigencia queda bloqueada con candado al editar; errores inline accesibles, foco al primer
campo inválido, límite de 10 importes y bloqueo con spinner mientras guarda. Incluye modo oscuro.

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

`GET /export` sin `tablas` y con `ser_laboral_id` válido une Facturas + Admisiones + Ser Laboral
en ese orden, un solo encabezado, mismas columnas seleccionadas, una hoja (salvo límite físico
de Excel). Sin `tablas` ni token conserva Facturas + Admisiones. Con `tablas` solo exporta la
selección explícita descrita arriba. Cuando corresponde resolver el token, si es desconocido,
expirado o expulsado → 410 antes de consultar SQL:
`{"detail": "El archivo de Ser Laboral expiró; cárgalo de nuevo."}`.
La consulta general no invalida tokens de otros clientes; el frontend descarta su token al
reconsultar. Son tokens portadores: deben mantenerse privados como los datos del informe.

### Consumo de Laboratorio

API: `/api/v1/statistics/administrative/lab-consumption`; todas sus rutas requieren el
permiso existente `statistics.administrative.lab_consumption.view` (401 sin sesión, 403 sin
permiso; el de Consumo General no lo concede). Módulos paralelos de dominio/aplicación/HTTP,
servicio de vida de aplicación y limpieza de ambas cachés al apagar; no cambia las reglas de
Facturación General ni Consumo General. No depende de cuotas moderadoras.

- `GET /filters/sites`, `/filters/companies`: catálogos compartidos. No ofrece selector ni
  catálogo HTTP de líneas. `GET ""` exige `fecha_inicial`, `fecha_final` inclusivas y admite
  `sedes`/`empresas` opcionales repetibles. Resuelve los ids actuales de `tbLineasProductos`
  cuyo nombre contiene LABORATORIO (sin distinguir mayúsculas), construye un `ReportFilter`
  con esos `lineas` para **ambas** fuentes SQL existentes y las ejecuta con `asyncio.gather`.
  Un `lineas` enviado por el cliente nunca reemplaza esa restricción. Sin líneas devuelve
  listas vacías y `advertencias: ["No hay líneas de producto de LABORATORIO configuradas."]`,
  sin ejecutar los informes SQL. Además verifica `lna_prdcto` en Python.
- Respuesta: `{facturas, admisiones, total_facturas, total_admisiones, advertencias}`. Cada
  fila tiene exactamente las doce claves de la tabla siguiente, en ese orden. Texto en
  mayúsculas/trim, fechas ISO (inválidas vacías), cantidades JSON numéricas exactas.

| Clave común | Encabezado | Facturas | Admisiones | Ser Laboral |
| --- | --- | --- | --- | --- |
| `cnsctvo_dcto` | Transacción / Factura / Admisión | `cnsctvo_dcto` | `cnsctvo_admsn` | `cnsctvo_dcto` |
| `cdgo_prcdmnto` | CUPS | `cdgo_prcdmnto` | `cdgo_prcdmnto` | `cdgo_prcdmnto` |
| `lna_prdcto` | Tipo Procedimiento | `lna_prdcto` | `lna_prdcto` | `lna_prdcto` |
| `procedimiento` | Nombre Procedimiento | `procedimiento` | `prcdmnto` | `procedimiento` |
| `cntdd` | Cantidad | `cntdd` | `cntdd` | `cntdd` |
| `fcha_ingrso_pcnte` | Fecha Ingreso | `fcha_ingrso_pcnte` | `fcha_admsn` | `fcha_dcto` |
| `fcha_dcto` | Fecha Factura | `fcha_dcto` | `fcha_slda_admsn` | `fcha_dcto` |
| `admision` | Admisión | `admision` | `cnsctvo_admsn` | vacío |
| `estado` | Estado Documento | `estado` | `estdo_admsn` | CERRADO |
| `emprs` | Empresa | `emprs` | `emprsa` | `emprs` |
| `dscrp_transcn` | Tipo Documento | `dscrp_transcn` | constante **ADMISIÓN** | `dscrp_transcn` |
| `sede` | Sede | `sede` | `sede` | `sede` |

Facturas reutiliza `domain.general_consumption.fila_cumple` sin modificarlo y añade la
guardia LABORATORIO; Admisiones solo aplica la guardia (incluye estados abiertos).
El spool y los workers compartidos de Consumo General mantienen SQL y ETL fuera del event loop;
los archivos temporales se cierran también al fallar/cancelar. No se cachean consultas SQL en
este informe; las cargas sí se cachean por token. El resultado JSON completo reside en memoria.

- `POST /ser-laboral`: cuerpo CSV crudo, máximo 25 MiB. Reutiliza el parser de Consumo General
  (mismas cabeceras requeridas/errores 422, BOM/cp1252, dinero `10,500.00`, fechas del CSV).
  Retiene solo CERRADO + línea LABORATORIO, cero filas → 422
  `Ningún registro cumple los filtros.`; `omitidas` cuenta ambos motivos. Respuesta
  `{ser_laboral_id, filas, total, omitidas, advertencias}`; doce claves, sin análisis.
- `POST /annar-lab`: cuerpo Excel crudo, **sin JSON ni multipart**, máximo 25 MiB.
  El cliente declara el formato con `Content-Type`: `.xls` → `application/vnd.ms-excel`,
  `.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  Sin Content-Type se conserva XLS por compatibilidad. Nginx production limits only these upload
  routes to 25 MiB and converts its local 413 to JSON `{"detail":"El archivo excede el límite de 25 MB."}`;
  other API modules keep their existing limit. Otros tipos → 422
  `Tipo de archivo no permitido; usa XLS o XLSX de ANNAR LAB.`. No se recibe nombre de
  archivo; el backend comprueba que el contenido corresponde al formato declarado, sin
  intentar otro lector al fallar. `.xls` usa `xlrd.open_workbook(on_demand=True)`;
  `.xlsx` usa `openpyxl.load_workbook(read_only=True, data_only=True, keep_links=False)`
  y cierra el libro incluso al fallar. Ambos lectores exigen una sola hoja y ejecutan
  la misma validación/mapeo/agrupación en `asyncio.to_thread`. Fórmulas XLSX no se ejecutan:
  solo se leen valores guardados; sin valor guardado la celda queda vacía.
  Dependencias runtime: **xlrd>=2.0.1** (lock: 2.0.2), **openpyxl>=3.1.5**
  (lock: 3.1.5; dependencia et-xmlfile 2.0.0). Instalar el entorno bloqueado con
  `cd backend && uv sync --locked`.
  Las 14 cabeceras requeridas del contrato son: Sede, Nombre Sede, Cliente, Nombre Cliente,
  Cen.Costo, Nombre Centro de Costos, Medico, Nombre Medico, Seccion, Nombre de la Sección,
  Examen, Nombre del Examen, Nivel, Valor. Matching sin acentos/NBSP/espacios y tolerancia a
  variantes mal codificadas de Sección; faltantes → 422
  `Cabeceras requeridas faltantes: <lista>.`; requeridas duplicadas → 422
  `No se permiten cabeceras requeridas duplicadas.`. XLS inválido/formato incorrecto →
  422 `El archivo XLS de ANNAR LAB no es válido.`; para XLSX,
  `El archivo XLSX de ANNAR LAB no es válido.`. Más/menos de una hoja → 422
  `El archivo XLS de ANNAR LAB debe tener una sola hoja.` (XLSX usa `XLSX` en el mensaje). Filas completamente vacías omitidas,
  sin filtro de estado ni línea; valores trim (conserva mayúsculas/minúsculas originales).
  Respuesta `{annar_lab_id, filas, total, advertencias, analisis_annar}`. Siete claves:
  `codigo_centro_costo` ← Seccion; `nombre_centro_costos` ← Nombre de la Sección;
  `examen` ← Examen; `nombre_examen` ← Nombre del Examen; `cantidad` = 1;
  `empresa` ← Nombre Cliente; `punto_atencion` ← Nombre Centro de Costos. El detalle conserva
  la proyección por sección/centro de costo. El análisis ANNAR agrupa por **(Examen, Nombre del Examen)**,
  cuenta filas, ordena por código numérico y omite filas con Examen o Nombre del Examen vacíos;
  respuesta `{examen, descripcion, cantidad}`.
  Datos Aplicativo lo agrupa el frontend localmente por CUPS sobre las tres listas comunes;
  no existe `analisis_aplicativo` en las respuestas del backend.

Ambas cargas usan la caché compartida SerLaboralCache con procesador/clave de respuesta/error
inyectables, manteniendo sus valores por defecto para Consumo General. Por cada pipeline:
TTL fijo 30 minutos, máximo 8 cargas, expulsión de la más antigua, tokens aleatorios de 256 bits,
expiración activa y monotónica, sin almacenamiento persistente. Cargas inválidas no publican
ni expulsan tokens. El frontend conserva imports y tokens al reconsultar; `Limpiar` los retira del estado de página, mientras la caché del servidor los conserva hasta su TTL. No invalida otros clientes.
Más de 25 MiB se rechaza incrementalmente con 413 antes de continuar leyendo el cuerpo;
exactamente 25 MiB se admite. Valorar memoria de ocho cargas por cada pipeline.

`GET /export?formato=csv|xlsx` comparte los filtros de fechas/sede/empresa y **siempre**
produce una descarga agrupada, nunca un archivo por fuente. `tablas` se acepta (incluso
repetido) y se ignora, por compatibilidad con los botones individuales anteriores.

- XLSX: un libro con exactamente dos hojas: **Datos Aplicativo** y **ANNAR LAB**.
  Datos Aplicativo contiene Facturas Detalladas, luego Admisiones y finalmente Ser Laboral
  si se suministra `ser_laboral_id`; un solo encabezado de doce columnas. ANNAR LAB contiene
  todos los registros del token `annar_lab_id`, con seis encabezados: Código Centro de Costo,
  Nombre Centro de Costos, Nombre del Examen, Cantidad, Empresa, Punto Atención.
  Sin token ANNAR la hoja existe con sus encabezados, sin filas.
- CSV: un ZIP (`application/zip`) con `Datos_Aplicativo.csv` y `ANNAR_LAB.csv`, mismo contenido
  que las hojas, separador `;` y UTF-8 con BOM en **cada** archivo, incluso sin filas.
- `columnas=clave:text|number|date` repetible afecta solo a Datos Aplicativo; conserva el
  orden solicitado y rechaza desconocidas/duplicadas/tipos inválidos con 422 antes de SQL.
- Ambos tokens son opcionales, independientemente de `tablas`. Todo token suministrado se
  resuelve antes de SQL/cabeceras. Desconocido/expirado/expulsado → 410 con los mensajes
  existentes `El archivo de Ser Laboral expiró; cárgalo de nuevo.` o
  `El archivo de ANNAR LAB expiró; cárgalo de nuevo.`; omitirlo ya no genera 422.
- Las dos fuentes SQL se ejecutan una sola vez por descarga, en paralelo. Se conservan las
  cachés de importación; los archivos se construyen en un worker y temporales del sistema,
  se transmiten por bloques y se cierran al terminar/cancelar. Sin nuevas dependencias.
  Un resultado XLSX que exceda el límite físico de filas de una hoja se rechaza con 422,
  nunca se divide silenciosamente en hojas adicionales.
- Nombre: `consumo-laboratorio_<inicio>_<fin>.xlsx` o `.zip`.

`POST /export/analysis/xlsx` recibe, sin consultar SQL:

```json
{
  "aplicativo": [{"cups": "001", "descripcion": "HEMOGRAMA", "cantidad": 12500.5}],
  "annar": [{"examen": "10", "descripcion": "HEMATOLOGÍA", "cantidad": 22508}],
  "titulo": "CONSUMO DE LABORATORIO",
  "periodo": "ENERO 2026"
}
```

Devuelve `analisis-consumo-laboratorio.xlsx`, una hoja **Análisis** con **Datos Aplicativo** en
A:C y **ANNAR LAB** en E:G, separadas por la columna D vacía. ANNAR usa las cabeceras
Código/Descripción/Cantidad. Conserva los títulos, bordes y estilo azul como Consumo General; las cantidades son celdas numéricas con
formato General, sin separadores decimales opcionales al final. Mismo permiso del módulo, `Cache-Control: no-store`.
Las dos listas son obligatorias (pueden estar vacías), máximo 10.000 filas por tabla;
`cups`/`examen` son texto de hasta 100 caracteres (`seccion` se acepta como alias legacy), `descripcion` hasta 500 y `cantidad`
finita con máximo 38 dígitos y 10 decimales. `titulo` y `periodo` opcionales (predeterminados
CONSUMO DE LABORATORIO y vacío), hasta 120/180 caracteres. Forma/campos adicionales/límites
inválidos → 422. Los textos se escapan para XML y no se ejecutan como fórmulas.

Pruebas sintéticas de importación: `tests/unit/statistics/test_lab_consumption.py`,
`tests/unit/statistics/test_lab_annar_import.py` y
`tests/unit/statistics/test_lab_consumption_verification.py`: XLS BIFF/OLE2 y XLSX,
transporte crudo fragmentado con aplicación real/auth/CORS, 14 cabeceras faltantes o
requeridas duplicadas, archivos inválidos/formato incorrecto y tokens previos exportables
tras rechazar reemplazos con caché llena. Exportaciones: `tests/unit/statistics/test_lab_exports.py`.
No se leen libros de usuarios en estas pruebas ni se ha reproducido o demostrado la causa
raíz del fallo de un archivo real reportado. Pendiente comprobar consultas y rendimiento
contra SQL Server real y memoria con cargas XLSX de producción.

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
