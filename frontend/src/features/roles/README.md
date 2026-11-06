# Roles

Administración de roles y permisos en `/configuracion/roles`. La ruta existente requiere
`ADMINISTRADOR`; los endpoints reales vuelven a comprobar la autorización.

## Uso

- La tabla busca en el servidor después de 300 ms, permite cambiar el tamaño de página y usa
  `X-Total-Count` para paginar. El resumen de permisos muestra códigos, no identificadores.
- **Nuevo rol** abre el panel de creación. El código usa de 2 a 50 caracteres (`A-Z`, `0-9`, `_`)
  y empieza con una letra. Nombre: 1–100 caracteres; descripción opcional: 1–255. Se recortan espacios.
- **Editar** conserva el código como solo lectura. El panel agrupa el catálogo completo por módulo;
  cada grupo permite seleccionar todos sus permisos y muestra el número seleccionado.
- **Guardar** envía solamente los campos modificados y después las asignaciones/revocaciones
  necesarias. Una descripción existente no puede vaciarse: el backend rechaza tanto `null`
  como una cadena vacía; puede reemplazarse por otro texto.
- Si un paso falla, el panel permanece abierto, explica el paso y recarga la tabla. Los pasos
  completados se conservan; otro intento desde el mismo panel procesa solamente lo pendiente.
  Si falla una asignación tras crear, el rol ya existe: no se elimina ni se vuelve a crear.
  Cancelar después de un guardado parcial tampoco revierte operaciones ya confirmadas.
- El catálogo debe cargarse correctamente antes de guardar. Puede reintentarse su carga sin
  perder los datos del formulario.
- **Eliminar** exige confirmación. Los roles del sistema (`ADMINISTRADOR`, `ESTADISTICA`,
  `FACTURACION`) tienen la acción deshabilitada. `ADMINISTRADOR` tampoco permite cambiar estado
  ni permisos desde el panel. El backend sigue siendo la autoridad y explica los conflictos,
  incluidos los roles con usuarios asignados, mediante un aviso en línea.

## Límites del módulo

`api/roles-api.ts` encapsula `/roles` y las mutaciones de permisos por **id**.
`api/permission-options.ts` recorre `/permissions` en lotes de 100 hasta el total de la cabecera,
independientemente del módulo Permisos. No hay datos locales ni dependencias entre features.
Se reutilizan DataTable/usePagedQuery/pagedResult, FormDrawer, ConfirmDialog, InlineAlert,
las primitivas visuales y la instancia HTTP compartida (incluido su refresh de sesión).

Pruebas deterministas desde `frontend/`: `corepack pnpm test src/features/roles`.
La página se simula en el límite de sus módulos API; las pruebas del adaptador comprueban
las llamadas al cliente HTTP. Las pruebas no necesitan un backend ni credenciales.
La comprobación visual en navegador y la integración contra un backend en ejecución son
verificaciones separadas de esta batería.
