# Secretaría Gerencia — Facturas Detalladas

La fuente SQL ejecuta una variante de la consulta de Facturas Detalladas con el lector SQL Server de solo lectura. Comparte los joins, filtros y orden del informe existente; cambia únicamente la proyección y añade búsqueda. No llama al endpoint de Facturas Detalladas ni utiliza su permiso, el CSV de Ser Laboral o el procesamiento de Consumo General.

## Consulta y exportación

El router `management_secretariat_router` requiere `statistics.administrative.management_secretariat.view`. El montaje en la aplicación corresponde a T1. Las rutas siguientes son relativas al prefijo de la API:

- `GET /statistics/administrative/management-secretariat/detailed-invoices`: devuelve filas ordenadas, con `X-Total-Count`. Fechas obligatorias `fecha_inicial` y `fecha_final` (ISO e inclusivas); `limit` (1–100, predefinido 50) y `offset` (≥0, predefinido 0).
- Parámetros opcionales de consulta y exportación: `sedes`, `empresas`, `lineas` (IDs repetibles) y `buscar` (texto literal, máximo 200 caracteres). La búsqueda SQL no interpreta comodines; compara sin distinguir mayúsculas y minúsculas los valores proyectados antes de limpiar espacios para la visualización.
- `GET .../filters/sites`, `GET .../filters/companies`, `GET .../filters/product-lines`: catálogos de filtros.
- `GET .../export?formato=csv` o `formato=xlsx`: ejecuta la misma selección SQL sin paginación. Por defecto exporta las 31 columnas; `columnas=<clave>` (repetible) selecciona un subconjunto en el orden oficial. Las claves desconocidas o repetidas se rechazan antes de acceder a SQL. Un resultado vacío conserva los encabezados.

El JSON contiene las claves de `COLUMNS` en `backend/src/nexora/statistics/domain/management_secretariat.py`; el mismo contrato fija etiquetas y orden para la tabla y los archivos. Los valores ausentes son `null` en JSON y celdas vacías en los archivos. Las fechas son `AAAA-MM-DD` en JSON y `DD/MM/AAAA` en los archivos. Los identificadores conservan ceros iniciales; sólo se recorta espacio exterior. No se deduplican filas por igualdad de los 31 valores: dos detalles de origen pueden tener la misma proyección.

La proyección no convierte importes a `BIGINT` ni cantidades a `INT`. Respeta los tipos de origen y la aritmética nativa de SQL Server. El API devuelve cantidades e importes como cadenas decimales para evitar la conversión a un `Number` de JavaScript. CSV UTF-8 con BOM y separador `;` conserva los decimales en el archivo; si se abre con Excel, conviene importar identificadores e importes como texto para evitar la inferencia automática de tipos. XLSX escribe importes y cantidades como texto para conservar los dígitos (Excel limita la precisión de celdas numéricas a 15 dígitos). Falta verificar en SQL Server los tipos, escalas y posibles conversiones implícitas en `UNION ALL` y en la multiplicación; eliminar los casts de salida no prueba por sí solo la escala del cálculo.

## Mapeos pendientes en SQL

| Columna | Evidencia y decisión pendiente |
| --- | --- |
| Factura | Se publica únicamente para las filas identificadas como facturas agrupadas (`doc.tpo = 'F'`). Falta confirmar qué documentos directos son facturas y cómo exponer su número o factura agrupada asociada. |
| Código (Interno / CUPS) y Código (CUMS) | El código del servicio viene de la definición de procedimiento. En suministros no se publica código hasta confirmar el significado de `tbCatalogoSuministrosMedicamentos.cdgo` y `.rslcn` para este informe. Resolución no se asume como CUMS. |
| Vlr. Total Servicios / Suministros | La consulta existente calcula un importe por detalle; Facturación General lo acumula por factura. Falta confirmar nivel, agrupación y tratamiento de filtros para este total. |
| Vlr. Copago & Cuota Moderadora | `vlr_lqdd_pcnte` procede de `vlr_pgo` e incluye otros casos; la consulta también documenta valores duplicados entre copago y cuota. Falta confirmar selección, tratamiento de montos coincidentes y ubicación por documento. |
| Pago Particular y Descuento | Los totales por tipo de forma de pago no establecen por sí solos que sean pago particular y descuento (el tipo 2 también puede representar crédito). Falta confirmar la clasificación y la asignación por documento. |

Los valores no verificados quedan vacíos; no se sustituyen por cero. La pestaña y exportación de Ser Laboral tienen un contrato de fuente independiente y no forman parte de esta integración SQL.
