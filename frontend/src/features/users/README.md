# Usuarios

Administración conectada a `/api/v1/users`. La ruta exige `identity.users.view`;
las acciones tienen permisos independientes. Ocultar controles es presentación: la API
aplica la autorización y las protecciones del último administrador.
No se cambia el guard, la sesión ni el cliente HTTP compartido desde este módulo.

## Estructura compartida

La página usa `space-y-6`, `PageHeader` y una tarjeta `DataTable`, ambos con
`UsersIcon`, título y descripción, igual que Roles y Permisos. Columnas:
**Usuario**, **Nombre completo**, **Correo electrónico**, **Roles**, **Estado** y
**Acciones** (cuando hay permisos de mutación). El nombre completo reúne las partes
no vacías y usa «—» si faltan todas. Los roles usan `Badge variant="brand"` de texto,
sin iconos, o «Sin roles»; el estado usa `StatusBadge` semántico.
Buscador, tamaños **10/25/50/100**, paginación y `RowActionButton` son compartidos.

## Permisos y uso

Se consulta `useAuth().hasPermission` con las constantes compartidas `PERMISSIONS`.
Eliminar no concede consultar, crear, editar ni asignar roles.

| Acción o sección | Permiso necesario |
| --- | --- |
| **Nuevo usuario** | `identity.users.create` |
| Lápiz de edición | `identity.users.update`, `identity.users.deactivate` o `identity.users.assign_roles` |
| Papelera | `identity.users.delete` |
| Datos personales en edición | `identity.users.update`; en otro caso, solo lectura |
| Estado en edición | `identity.users.deactivate`; en otro caso, control deshabilitado de solo lectura |
| Catálogo y asignación de roles | `identity.users.assign_roles` **y** `identity.roles.view` |

- Buscar consulta el servidor tras 300 ms; paginación y tamaño usan `X-Total-Count`.
- **Nuevo usuario** incluye el icono de suma decorativo; su nombre accesible no cambia.
- Crear y editar usan **FormDialog** (TailAdmin Dialog with Form), no el panel lateral.
  El diálogo de usuarios usa un ancho moderado (`sm:max-w-3xl`), con margen en móvil;
  los demás consumidores mantienen el ancho predeterminado de FormDialog.
  El cuerpo del formulario tiene scroll dentro de una altura limitada a la pantalla;
  el encabezado y el pie permanecen fuera del área desplazable. Cancelar, Escape y X
  cierran sin guardar; no cierran mientras hay una mutación pendiente.
- El formulario agrupa **Cuenta**, **Datos personales**, **Acceso** y, cuando está autorizado,
  **Roles**, con campos en una columna en móvil y dos desde `sm`. Estado sigue disponible
  solo en edición; no se cambia el contrato de creación.
- **Nuevo usuario** solicita usuario, correo, primer nombre, primer apellido, contraseña y
  **Confirmar contraseña**. La confirmación es obligatoria, usa `autocomplete="new-password"`
  y debe coincidir exactamente, sin recortar espacios. Si difiere, se muestra
  «Las contraseñas no coinciden.» asociado al campo y se enfoca el primer error;
  no se envía ninguna mutación. La confirmación nunca forma parte del payload de API.
  La contraseña conserva su política
  (6–24 caracteres Unicode, sin recortar espacios, con mayúscula, minúscula, número y
  carácter especial de puntuación o símbolo). Los requisitos se actualizan en vivo con
  estados accesibles: gris y círculo neutral para pendientes, verde y check para cumplidos,
  rojo y cruz para incumplidos tras desenfocar la contraseña o intentar guardar.
  La ayuda breve es «Entre 6 y 24 caracteres.». Ambos campos reutilizan `PasswordInput`
  con botones «Mostrar/Ocultar contraseña» y «Mostrar/Ocultar confirmación de contraseña»;
  la visibilidad se reinicia al vaciar los controles. La coincidencia se indica en vivo al
  escribir cualquiera de las claves, sin duplicar el error final de confirmación.
  React solo guarda booleanos de cumplimiento y coincidencia. La contraseña
  permanece en el control y en la petición de creación. Ambos secretos son controles no
  controlados, se leen con FormData y se limpian al iniciar la petición (también si falla),
  al resetear y al cerrar/reabrir el diálogo; nunca se muestran en errores.
  La política única está en `src/lib/password-policy.ts`;
  el backend valida definitivamente y mantiene Argon2id.
  Solo se ofrecen roles con ambos permisos de catálogo y asignación; se asignan después
  de crear. Si ese segundo paso falla, reintentar no crea otro usuario ni solicita otra contraseña.
- **Editar** envía un único PATCH mínimo con los campos modificados y autorizados:
  datos personales con `users.update`, estado con `users.deactivate`. Las diferencias de
  roles se aplican después, sin PATCH si solo cambian roles. No hay peticiones de mutación
  si nada editable cambió. Un diálogo sin controles editables ofrece **Cerrar**, no **Guardar**.
- Sin `users.assign_roles` no se muestra la sección de roles. En edición, con ese permiso
  pero sin `roles.view`, aparece una sección deshabilitada con una nota explicativa;
  no se consulta `/roles` ni se bloquea el guardado de otros campos autorizados.
- Los roles se presentan como tarjetas de checkbox en una cuadrícula responsive, con nombre
  como única etiqueta (si está vacío, se muestra el código), hasta cuatro columnas
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`), checkbox alineado al centro,
  borde/tinte de marca al seleccionar y anillo de foco para teclado. Se conserva la selección por códigos y las
  mutaciones por ids. El catálogo autorizado se carga completo en páginas de 100 desde un
  adaptador local; un fallo bloquea el guardado y ofrece **Reintentar roles**. Códigos ausentes
  se conservan; carga, error, vacío y avisos de permisos siguen disponibles.
- Los campos opcionales existentes no pueden vaciarse: PATCH rechaza null y cadenas vacías.
  Correo sigue el contrato real de texto no vacío, hasta 255 caracteres.
- El guardado **no es atómico**: ante un fallo el diálogo permanece abierto, indica el paso
  fallido y los pasos ya confirmados, y recarga la tabla. Reintentar no repite pasos confirmados.
  Ante pérdida de conexión puede haber un resultado incierto: comprobar la tabla y volver
  a abrir el diálogo antes de decidir un nuevo intento. Cancelar no revierte pasos aplicados.
- **Eliminar** exige ConfirmDialog e identifica al usuario. Cancelar no envía peticiones;
  éxito recarga el listado y ajusta la última página. Un conflicto conserva el diálogo.

Errores 403/404/409 muestran el `detail` del backend en InlineAlert; 401/red tienen mensajes seguros.
422 se asocia a campos mediante `loc`, sin mostrar `input`, `ctx` ni mensajes crudos
que puedan contener contraseñas. Las restricciones del cliente se muestran bajo el campo,
con `aria-invalid`, asociación de mensaje y foco en el primer error.

## Límites y verificación

API, validación, coordinación de mutaciones y presentación viven separadas dentro de
este módulo. Se consumen DataTable/usePagedQuery/pagedResult, FormDialog, ConfirmDialog,
InlineAlert y controles compartidos sin duplicarlos. No existe restablecimiento de contraseña.

Desde `frontend/`: `npx vitest run`, `npx tsc -b` y `npm run lint`.
Las pruebas de página simulan `useAuth` y los módulos de API, no la red. Cubren la matriz
independiente de permisos, cuerpos mínimos, diferencias de roles, cierre/bloqueo del diálogo,
validaciones, confirmación sin filtración al payload, limpieza de secretos, secciones agrupadas,
selección de tarjetas y guardados parciales. Las de adaptadores comprueban el cliente HTTP compartido
y el catálogo paginado. Se verifica estructuralmente el scroll con un catálogo de 100 roles;
se requiere comprobación visual en navegador para ambos temas y pantallas móviles:
jsdom no demuestra apariencia, dimensiones reales ni conectividad.
