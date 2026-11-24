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

Las cuatro pestañas Line son **Análisis**, **Facturas Detalladas**, **Admisiones**
y **Ser Laboral**. Cambiar pestañas, páginas o columnas no hace nuevas consultas.
Las tres tablas paginan localmente y comparten la selección de 40 columnas visibles.

## Ser Laboral (S15)

**Cargar CSV Ser Laboral** aparece inmediatamente antes de **Consultar** y solo
se habilita tras una consulta general exitosa. Abre un selector `.csv`, muestra
el estado de carga y, al terminar, selecciona Ser Laboral con total, omitidas y
advertencias. Antes de cargar se muestra un estado vacío. Una consulta nueva o
**Limpiar** descarta filas y token, y cancela cualquier carga pendiente.

`uploadSerLaboral(file)` envía el `File` crudo por `POST /ser-laboral`, con
`Content-Type: text/csv`, nunca multipart ni JSON. El adaptador local reutiliza
`createHttpClient` y los manejadores de sesión existentes para conservar
credenciales, renovación, notificaciones y errores; no cambia el cliente JSON
compartido. Los errores 422 (validación) y 413 (límite del servidor de 25 MB)
muestran el detalle de la API; una carga rechazada conserva el CSV previo.

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
- La barra de acciones sobre las pestañas, alineada a la derecha, contiene
  **Exportar datos unidos** (S16). La barra solo se renderiza tras una consulta
  exitosa; se oculta al limpiar, durante una nueva consulta y si esta falla.
  El texto auxiliar muestra las fuentes incluidas. Este menú descarga por
  `GET /export?formato=csv|xlsx`, con los filtros **aplicados** y `columnas` en el
  orden de las 40 columnas (todas o visibles). El backend genera un archivo con
  Facturas Detalladas y luego Admisiones, con un solo encabezado, sin indicadores.
  Cuando se carga Ser Laboral se añade `ser_laboral_id` y el backend concatena sus
  filas al final, en la misma hoja/CSV. La paginación local nunca limita la exportación.
  Un 410 descarta filas y token caducados e indica exactamente:
  «El archivo de Ser Laboral expiró; cárgalo de nuevo.» La siguiente exportación
  omite el token hasta cargar de nuevo el CSV.

Las pruebas simulan la API; no necesitan SQL Server ni el backend en ejecución.
