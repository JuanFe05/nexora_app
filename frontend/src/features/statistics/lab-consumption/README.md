# Consumo de Laboratorio

Ruta: `/estadistica/administrativa/consumo-laboratorio`. Requiere el permiso existente `PERMISSIONS.labConsumptionView`.

## Consulta e importación

- Filtros: Fecha inicial, Fecha final, Sede y Empresa. No se envían líneas de producto; el backend restringe la consulta a laboratorio.
- `Consultar` obtiene Facturas Detalladas y Admisiones en una sola petición. Las cinco pestañas usan Tabs line y las tablas de detalle tienen paginación local y Columnas visibles.
- `Importar archivos`, antes de `Consultar`, se habilita después de una consulta exitosa. Abre un FormDialog con CSV Ser Laboral (`.csv`) y Excel ANNAR LAB (`.xls`). Se requiere al menos uno.
- Los archivos seleccionados se envían como cuerpos crudos autenticados, simultáneamente cuando se seleccionan ambos. No se usa FormData ni JSON. Los resultados y errores 422/413 se muestran por archivo; un resultado parcial mantiene abierto el modal y conserva los datos válidos. Al reintentar no se reenvían los archivos ya importados correctamente, salvo que se seleccione otro archivo.
- El modal se cierra cuando todos los archivos enviados tienen éxito y se activa la primera pestaña importada en ese envío (Ser Laboral antes de ANNAR LAB si se envían ambos). Una nueva consulta o Limpiar aborta las cargas pendientes y descarta datos importados y tokens.

## Análisis y exportación

Datos Aplicativo suma localmente `cntdd` por `cdgo_prcdmnto` de Facturas + Admisiones + Ser Laboral. Conserva la primera descripción no vacía y ordena por cantidad descendente. Annar Lab utiliza `analisis_annar` del backend.

La barra `Exportar datos unidos` solo se renderiza tras una consulta exitosa; se oculta al limpiar, durante una nueva consulta y si esta falla.

Cada tabla de detalle coloca `Exportar` después de `Columnas visibles`, con `tablas` y únicamente el token correspondiente. `Exportar datos unidos` omite `tablas`, incluye Ser Laboral cuando está cargado y nunca incluye ANNAR LAB ni su token. Se conservan las fechas y filtros de la consulta aplicada, no los cambios aún no consultados. Una respuesta 410 elimina los datos/token del archivo vencido y solicita volver a importarlo.

API: `/statistics/administrative/lab-consumption`, con `/filters/sites`, `/filters/companies`, `/ser-laboral`, `/annar-lab` y `/export`. El transporte crudo local conserva las garantías del cliente HTTP compartido (sesión, refresh, credenciales y errores), siguiendo el patrón de Consumo General sin modificarlo.

## Pruebas

Desde `frontend`:

```sh
node node_modules/vitest/vitest.mjs run src/features/statistics/lab-consumption
```

Las pruebas usan respuestas y archivos sintéticos; no dependen de datos reales ni del backend.
