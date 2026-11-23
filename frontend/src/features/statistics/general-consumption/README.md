# Consumo General

Ruta: `/estadistica/administrativa/consumo-general`, protegida por
`PERMISSIONS.generalConsumptionView`.

## Consulta

Los filtros compartidos son fecha inicial, fecha final, sede, empresa y línea de
producto. Solo **Consultar** aplica los filtros: un `GET` a
`/statistics/administrative/general-consumption` devuelve `indicadores`,
`facturas`, `admisiones`, `advertencias`, `total_facturas` y `total_admisiones`.
Los catálogos usan `/filters/sites`, `/filters/companies` y
`/filters/product-lines`. Fechas y selecciones se serializan como
`fecha_inicial`, `fecha_final`, `sedes`, `empresas` y `lineas` (IDs repetidos).

Las tres pestañas Line son **Análisis**, **Facturas Detalladas** y **Admisiones**.
Cambiar pestañas, páginas o columnas no hace nuevas consultas. Las dos tablas
paginan localmente y comparten la selección de columnas visibles.

## Columnas y exportaciones

Conforme a la corrección del documento de Consumo General, `columns.tsx` deriva
**40** columnas de Facturación General, conservando orden, encabezados y
renderizadores, sin `cnsctvo_fctra_agrpda`, `no_remision`, `fcha_rmsn` ni `no_envio`.
No se consulta `/columns` ni se modifica Facturación General.

- **Análisis** muestra los siete indicadores calculados por el backend sobre
  Facturas Detalladas válidas. Los valores usan `Intl.NumberFormat("es-CO")` con
  moneda COP. No se recalculan reglas financieras en el navegador.
- **Exportar PDF** y **Exportar Excel** envían únicamente
  `{ indicadores: [...] }` por `POST /export/analysis/pdf` o
  `POST /export/analysis/xlsx`. La respuesta Blob se descarga sin enviar filas.
- El único menú **Exportar** descarga datos combinados por
  `GET /export?formato=csv|xlsx`, con los filtros **aplicados** y `columnas` en el
  orden de las 40 columnas (todas o visibles). El backend genera un archivo con
  Facturas Detalladas y luego Admisiones, con un solo encabezado, sin indicadores.
  La paginación local nunca limita la exportación.

Las pruebas simulan la API; no necesitan SQL Server ni el backend en ejecución.
