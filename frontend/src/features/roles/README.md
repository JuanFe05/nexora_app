# Roles

Administración de roles y permisos en `/configuracion/roles`. La ruta requiere
`identity.roles.view`; los endpoints reales vuelven a comprobar la autorización.
Los permisos son independientes: eliminar no concede consultar, crear ni editar.

## Acciones y permisos

| Acción | Permiso efectivo requerido |
| --- | --- |
| Nuevo rol | `identity.roles.create` |
| Abrir edición (lápiz) | `identity.roles.update` o `identity.roles.assign_permissions` |
| Cambiar nombre, descripción o estado | `identity.roles.update` |
| Seleccionar permisos | `identity.roles.assign_permissions` y `identity.permissions.view` |
| Eliminar (papelera) | `identity.roles.delete`, salvo roles del sistema |

Las acciones no autorizadas se ocultan, no se muestran como botones deshabilitados.
En edición, los datos sin permiso de actualización son de solo lectura y el catálogo
sin permiso de asignación queda deshabilitado. Sin `identity.permissions.view` no se
consulta `/permissions`; si se permite asignar, una nota explica por qué no se puede
seleccionar. La creación solo ofrece selección con ambos permisos. Un diálogo sin
ninguna parte editable ofrece **Cerrar** en lugar de **Guardar cambios**.

## Uso

- La tabla busca en el servidor después de 300 ms, permite cambiar el tamaño de página y usa
  `X-Total-Count` para paginar. El resumen de permisos muestra códigos, no identificadores.
- **Nuevo rol** abre el Dialog with Form de TailAdmin. El código usa de 2 a 50 caracteres
  (`A-Z`, `0-9`, `_`) y empieza con una letra. Nombre: 1–100 caracteres; descripción opcional:
  1–255. Se recortan espacios. Creación y edición usan `sm:max-w-6xl` y dos paneles
  independientes: **Información del rol** a la izquierda y **Permisos** a la derecha desde
  `lg`; debajo se apilan con información primero. Código y Nombre van en una fila desde
  `sm` y vuelven a apilarse en el panel lateral desde `lg`. Estado se mantiene en edición,
  con las mismas restricciones existentes.
  Descripción usa un textarea redimensionable con `maxLength=255` y un contador accesible
  `n/255`: advertencia desde 230, rojo desde 255. El contador y la validación cuentan puntos
  de código Unicode después de recortar espacios, sin modificar el texto ni el payload.
  El límite proviene de `Description` (`RoleCreate`/`RoleUpdate`) en
  `backend/src/nexora/identity_access/presentation/http/v1/schemas/administration.py`.
  El atributo HTML `maxLength` cuenta unidades UTF-16; la entrada nativa de caracteres
  suplementarios (por ejemplo, emoji) puede alcanzar ese tope antes del contador Unicode.
- **Editar** conserva el código como solo lectura y precarga `role.permisos`. El catálogo
  real se agrupa por `modulo` en tarjetas Accordion de Base UI; no se crean permisos locales.
  Cada cabecera muestra icono, nombre, descripción visual, contador y selección del módulo
  con estado parcial. Seleccionar el módulo no lo expande ni afecta otros módulos.
- **Seleccionar todos / Deseleccionar todos** afecta únicamente al catálogo visible y
  conserva las selecciones cuyos códigos no aparecen en él. Los contadores muestran las
  selecciones del catálogo, no esos códigos externos. Cada checkbox individual cambia
  **solo ese permiso**: crear, consultar, editar, eliminar y otras acciones no se vinculan.
- **Expandir todos / Contraer todos** controla múltiples módulos sin modificar permisos.
  Todos empiezan contraídos tanto al crear como al editar; después manda la navegación del
  usuario, no los cambios de selección. El catálogo deshabilitado permite inspeccionar
  módulos, pero no cambiar asignaciones. Durante el guardado el formulario bloquea controles.
- El contenido muestra nombres descriptivos, `descripcion` si existe y código técnico
  secundario. La cuadrícula conserva el orden del catálogo: una columna en móvil y dos
  desde `sm`, con selección, hover, foco y deshabilitado en temas claro y oscuro.
  `permission-grid.ts` ahora agrupa el catálogo; se retiró el algoritmo de columnas equilibradas.
- El backend no ofrece descripciones de módulos. El mapa visual local para `identity`
  (único módulo del catálogo sembrado en `access_catalog.py`) usa «Usuarios, roles y permisos
  de acceso.» e icono `UsersIcon`; otros módulos usan «Permisos del módulo <nombre>» y
  `LayoutGridIcon`. Esto no modifica los datos del catálogo. Se siguen las convenciones
  TailAdmin: no se adjuntó una propuesta visual a la solicitud.
- **Guardar cambios** envía solamente los campos modificados autorizados y después las
  asignaciones/revocaciones necesarias, si están autorizadas. Sin cambios no hay mutaciones.
  Una descripción existente no puede vaciarse: el backend rechaza tanto `null` como una
  cadena vacía; puede reemplazarse por otro texto.
- Si un paso falla, el diálogo permanece abierto, explica el paso y recarga la tabla.
  Los pasos completados se conservan; otro intento desde el mismo diálogo procesa solamente
  lo pendiente. Si falla una asignación tras crear, el rol ya existe: no se elimina ni se vuelve
  a crear. Cancelar después de un guardado parcial tampoco revierte operaciones confirmadas.
- El catálogo debe cargarse correctamente antes de guardar cambios de permisos; puede
  reintentarse su carga sin perder datos. Un guardado de datos sin permiso de asignación
  no depende del catálogo.
- Escape, Cancelar y X cierran sin guardar. Durante el guardado no se puede cerrar ni volver
  a enviar. El cuerpo tiene scroll independiente y altura máxima relativa a la pantalla;
  el encabezado y el pie permanecen fuera del área de scroll del checklist.
- **Eliminar** exige ConfirmDialog. Los roles del sistema (`ADMINISTRADOR`, `ESTADISTICA`,
  `FACTURACION`) no tienen papelera. `ADMINISTRADOR` tampoco permite cambiar estado ni permisos.
  El backend sigue siendo la autoridad y explica conflictos y rechazos 403 mediante su
  `detail` en un InlineAlert.

## Límites del módulo

`api/roles-api.ts` encapsula `/roles` y las mutaciones de permisos por **id**.
`api/permission-options.ts` recorre `/permissions` en lotes de 100 hasta el total de la cabecera,
independientemente del módulo Permisos. No hay datos locales ni dependencias entre features
administrativas. La autorización visual reutiliza `useAuth().hasPermission` y las constantes
`PERMISSIONS` de autenticación.
Se reutilizan DataTable/usePagedQuery/pagedResult, FormDialog, ConfirmDialog, InlineAlert,
las primitivas visuales y la instancia HTTP compartida (incluido su refresh de sesión).

Pruebas deterministas desde `frontend/`: `npx vitest run`.
La página se simula en el límite de sus módulos API y de useAuth; la matriz cubre permisos
independientes, campos, catálogo, creación, edición, eliminación y mutaciones autorizadas.
Las pruebas del Accordion y checklist cubren teclado, apertura múltiple, controles globales,
selección parcial y por módulo, independencia de acciones, descripciones, columnas y estados
vacío/deshabilitado. La página verifica paneles responsive, permisos precargados y persistencia
solo de diferencias, incluidos reintentos parciales y códigos fuera del catálogo.
Las pruebas del adaptador comprueban los cuerpos PATCH mínimos y las llamadas HTTP.
Las pruebas no necesitan un backend ni credenciales. La estructura de scroll se comprueba
con jsdom; la comprobación visual responsive en navegador y la integración contra un backend
en ejecución son verificaciones separadas de esta batería.
