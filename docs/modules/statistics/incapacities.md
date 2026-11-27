# Gestión de Incapacidades

Prefijo API: `/api/v1/statistics/administrative/disability-management`. Todas las rutas
exigen `statistics.administrative.disability_management.view`. No hay importación de archivos.

| Ruta `GET` | Parámetros y respuesta |
| --- | --- |
| Prefijo del informe | `fecha_inicial`, `fecha_final` (ISO `YYYY-MM-DD`, obligatorias), `empresas` (ID repetible, opcional), `search` (término literal opcional, sin distinción de mayúsculas/minúsculas), `limit` (1–100, predeterminado 50), `offset` (desde 0). Devuelve las 28 columnas y `X-Total-Count`; la búsqueda se aplica antes del total y la paginación sobre los valores mostrados. |
| `/filters/companies` | Catálogo compartido `[{id, nombre}]` de `tbEmpresas`, sin filtrar por estado. |
| `/export` | Mismas fechas, empresas y `search`, sin paginar. `formato=csv`, `formato=xlsx` o `formato=txt` y `columnas=clave:tipo` repetible (`text`, `number`, `date`). Las columnas salen en el orden solicitado, con el encabezado y tipo del catálogo del informe. TXT no incluye encabezado, separa los valores con `|` y conserva exactamente el orden de las columnas solicitadas. Para que cada fila sea inequívoca, el contenido de texto escapa `\\` como `\\\\`, `|` como `\\u007C` y los saltos de línea como `\\r`/`\\n`; fechas y números conservan su formato del informe. |

La columna `Empresa` proviene de la misma relación de empresa asociada a cada registro (`tbAfiliadosEmpresas` → `tbEmpresas`), por lo que corresponde a los registros filtrados.

Las fechas limitan **el inicio de la incapacidad** (`inc.fcha_incpcdd`), no la fecha de
solicitud; ambas son inclusivas. Omitir `empresas` incluye todas, incluso incapacidades
sin empresa asociada. Los filtros y las columnas inválidas devuelven 422 antes de consultar.

La consulta de solo lectura incluida en `infrastructure/queries/incapacities.py` deriva de
`data_ips/Incapacidades.sql`, que no necesita estar presente en el despliegue y no se modifica.
Conserva la fecha final calculada como inicio más duración menos un día. El catálogo
`application/incapacities.py:COLUMNS` define claves y encabezados. La tabla y las descargas
reciben la misma transformación: fechas `DD/MM/YYYY`, equivalencias de IPS, patología y
modalidad, prórroga `I`/`P`, nombre y apellidos del médico, y estado `Inicial`. Fecha probable
de parto, fecha probable de nacimiento y lateralidad se dejan vacías. CSV usa UTF-8 con BOM y
separador `;`; XLSX conserva identificaciones como texto. No se persisten filas en PostgreSQL.
