# Consumo de Laboratorio

Ruta: `/estadistica/administrativa/consumo-laboratorio`. Requiere el permiso existente `PERMISSIONS.labConsumptionView`.

## Consulta e importación

- Filtros: Fecha inicial, Fecha final, Sede y Empresa. No se envían líneas de producto; el backend restringe la consulta a laboratorio.
- `Consultar` obtiene Facturas Detalladas y Admisiones en una sola petición. Las cinco pestañas usan Tabs line y las tablas de detalle tienen paginación local y Columnas visibles.
- `Importar archivos`, situado antes de `Consultar`, permanece habilitado antes, durante y después de una consulta, incluso si esta falla. Usa el mismo estilo y ancho mínimo de `Consultar`. Abre un FormDialog con CSV Ser Laboral (`.csv`) y Excel ANNAR LAB. La ayuda muestra: **Formatos aceptados: Excel (.xls) y (.xlsx)**. Se requiere al menos uno; si ya hay una importación en curso, la acción no abre un segundo modal.
- Los archivos seleccionados se envían como cuerpos crudos autenticados, simultáneamente cuando se seleccionan ambos. No se usa FormData ni JSON. Los resultados y errores 422/413 se muestran por archivo; un resultado parcial mantiene abierto el modal y conserva los datos válidos. Al reintentar no se reenvían los archivos ya importados correctamente, salvo que se seleccione otro archivo.
- Cada archivo procesado correctamente revela las cinco pestañas y permite ver sus resultados sin una consulta previa. Facturas Detalladas y Admisiones muestran cero registros hasta consultar; Análisis utiliza las fuentes disponibles. Un éxito parcial también conserva su resultado al cancelar el modal tras el error del otro archivo.
- El modal se cierra cuando todos los archivos enviados tienen éxito y se activa la primera pestaña importada en ese envío (Ser Laboral antes de ANNAR LAB si se envían ambos). Cada fuente conserva sus datos independientemente: consultar de nuevo, reintentar una consulta fallida o un error del otro archivo no elimina los resultados ya procesados. Durante una nueva consulta o si esta falla se mantienen visibles los últimos resultados correctos; una consulta exitosa reemplaza solo Facturas Detalladas y Admisiones.
- Cada consulta aborta las cargas aún pendientes, sin eliminar las importaciones completadas ni sus tokens. `Limpiar` sigue siendo el reset explícito: aborta cargas pendientes y descarta todos los resultados y tokens, incluso si solo se importó y nunca se consultó.

## Análisis y exportación

Datos Aplicativo suma localmente `cntdd` por `cdgo_prcdmnto` de Facturas + Admisiones + Ser Laboral. Conserva la primera descripción no vacía y ordena por cantidad descendente. Annar Lab utiliza `analisis_annar` del backend.

La barra `Exportar datos unidos` solo se renderiza tras una consulta exitosa; se oculta al limpiar, durante una nueva consulta y si esta falla. Importar sin consultar permite ver resultados, pero no habilita la exportación agrupada ni los botones `Exportar` de detalle. No contiene el texto explicativo largo; conserva la misma acción de descarga.

Cada tabla de detalle coloca `Exportar` después de `Columnas visibles`. Todas las acciones, incluida `Exportar datos unidos`, usan `GET /export?formato=csv|xlsx&...` sin `tablas` y envían ambos tokens (`ser_laboral_id` / `annar_lab_id`) cuando están importados. `columnas` siempre corresponde a Datos Aplicativo: todas o las visibles en las tablas de Facturas/Admisiones/Ser Laboral, incluso al exportar desde ANNAR LAB. Su visibilidad propia solo afecta a la tabla ANNAR LAB.

- Excel descarga **un libro** con las hojas `Datos Aplicativo` (Facturas + Admisiones + Ser Laboral) y `ANNAR LAB`.
- CSV descarga **un ZIP** con `Datos_Aplicativo.csv` y `ANNAR_LAB.csv`.
- Se usa el nombre de `Content-Disposition` (`filename*` UTF-8 tiene prioridad sobre `filename`); si falta o no es válido, `consumo-laboratorio_<ini>_<fin>.xlsx|zip`. En despliegues cross-origin el backend debe exponer esa cabecera.
- Se conservan las fechas y filtros de la consulta aplicada, no los cambios aún no consultados. Una respuesta 410 elimina ambos datos/tokens importados y solicita volver a importarlos, pues la descarga agrupada no identifica necesariamente cuál venció.

En Análisis, `Exportar a Excel` envía `POST /export/analysis/xlsx` con `{ aplicativo: [{ cups, descripcion, cantidad }], annar: [{ examen, descripcion, cantidad }] }`, utilizando las mismas filas que muestran las tablas: las sumas locales ordenadas y `analisis_annar` sin reagruparlo. La respuesta blob se descarga como `analisis-consumo-laboratorio.xlsx`: una hoja Análisis con Datos Aplicativo en A:C, D vacía y ANNAR LAB en E:G, alineadas desde la misma fila. Las cantidades son celdas numéricas con formato General, sin separadores decimales opcionales al final. El botón queda deshabilitado si ambas tablas están vacías o durante la descarga (con spinner); un error permite reintentar sin perder los datos. Al desmontar Análisis se aborta la exportación pendiente.

API: `/statistics/administrative/lab-consumption`, con `/filters/sites`, `/filters/companies`, `/ser-laboral`, `/annar-lab` y `/export`. El transporte crudo local conserva las garantías del cliente HTTP compartido (sesión, refresh, credenciales y errores), siguiendo el patrón de Consumo General sin modificarlo.

## Pruebas

Desde `frontend`:

```sh
node node_modules/vitest/vitest.mjs run src/features/statistics/lab-consumption
```

Las pruebas usan respuestas y archivos sintéticos; no dependen de datos reales ni del backend.
