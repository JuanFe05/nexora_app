# Administracion de acceso e inicializacion

Siembra automatica de roles, permisos y primer administrador, y API de administracion de
usuarios, roles y permisos. La gestion se delega mediante permisos efectivos `identity.*`,
con limites anti-escalada en la capa de aplicacion.

## Inicializacion al arrancar

`initialize_access` corre en el `lifespan` de la aplicacion, en una sola transaccion, y es
idempotente: reiniciar no duplica registros. Un advisory lock de PostgreSQL serializa el arranque
simultaneo de varios workers.

1. Crea los roles `ADMINISTRADOR`, `ESTADISTICA` y `FACTURACION` si faltan.
2. Crea el catalogo de permisos (`identity.users.*`, `identity.roles.*`, `identity.permissions.*`;
   fuente unica en `domain/value_objects/access_catalog.py`) y lo asigna a `ADMINISTRADOR` en
   `rol_permiso`. `ESTADISTICA` y `FACTURACION` quedan sin permisos hasta que existan sus modulos.
3. Si no hay ningun administrador efectivo (usuario y rol `ADMINISTRADOR` activos) y hay
   credenciales configuradas, crea el usuario y registra su rol en `asignacion_rol`. Si ya existe
   un administrador efectivo, no crea otro; nunca reactiva usuarios ni roles existentes.

Los registros existentes no se sobrescriben: un nombre o descripcion editado por un administrador
sobrevive a los reinicios. Lo unico que se reafirma en cada arranque es que `ADMINISTRADOR` tenga
todos los permisos del catalogo.

### Credenciales del administrador inicial

Solo por variables de entorno; el codigo no trae ninguna credencial por defecto.

| Variable | Descripcion |
| --- | --- |
| `NEXORA_BOOTSTRAP_ADMIN_USERNAME` | Nombre de usuario |
| `NEXORA_BOOTSTRAP_ADMIN_EMAIL` | Correo |
| `NEXORA_BOOTSTRAP_ADMIN_PASSWORD` | Contrasena de 12-128 caracteres; se guarda con Argon2id |
| `NEXORA_BOOTSTRAP_ADMIN_FIRST_NAME` / `_LAST_NAME` | Nombre y apellido (por defecto `Administrador` / `NEXORA`) |

- Las tres primeras son todo o nada: configurar solo una impide arrancar.
- Sin credenciales en desarrollo o pruebas: se siembran roles y permisos, no se crea usuario y se
  registra una advertencia.
- En produccion, si al terminar no hay administrador efectivo (usuario y rol activos), el arranque
  falla (`AdministratorNotConfigured`) y revierte la transaccion, incluso con credenciales
  configuradas; fuera de produccion solo registra una advertencia.
- Despues del primer arranque la contrasena puede retirarse del `.env`.

## Autorizacion

Cada accion exige **solo su permiso**, mediante `require_permission(code)` y el principal
actual. Consultar, crear, editar, desactivar, eliminar y asignar son independientes: eliminar
no permite consultar, crear ni editar; consultar no permite mutar; crear no permite listar.
Los codigos reales conservan el prefijo `identity.` (por ejemplo, `identity.roles.view`).

| Endpoint (prefijo `/api/v1`) | Permiso requerido |
| --- | --- |
| `GET /users`, `GET /users/{id}` | `identity.users.view` |
| `POST /users` | `identity.users.create` |
| `PATCH /users/{id}` con campos de perfil, sin `estado` | `identity.users.update` |
| `PATCH /users/{id}` solo con `estado` (activar o desactivar) | `identity.users.deactivate` |
| `PATCH /users/{id}` con perfil y `estado` | Ambos: `identity.users.update` y `identity.users.deactivate` |
| `PATCH /users/{id}` con `{}` | `identity.users.update`; conserva el comportamiento sin cambios |
| `DELETE /users/{id}` | `identity.users.delete` |
| `PUT`, `DELETE /users/{id}/roles/{role_id}` | `identity.users.assign_roles` |
| `GET /roles`, `GET /roles/{id}` | `identity.roles.view` |
| `POST /roles` | `identity.roles.create` |
| `PATCH /roles/{id}` | `identity.roles.update` |
| `DELETE /roles/{id}` | `identity.roles.delete` |
| `PUT`, `DELETE /roles/{id}/permissions/{permission_id}` | `identity.roles.assign_permissions` |
| `GET /permissions`, `GET /permissions/{id}` | `identity.permissions.view` |
| `POST /permissions` | `identity.permissions.create` |
| `PATCH /permissions/{id}` | `identity.permissions.update` |
| `DELETE /permissions/{id}` | `identity.permissions.delete` |

Sin token la respuesta es 401. Sin el permiso requerido se responde
`403 {"detail": "No tiene permisos para ejecutar esta operacion"}` **antes de consultar el
recurso o mutar datos**: tambien para IDs inexistentes, incluidos IDs de asignaciones. Asi no
se revela si existe un recurso a quien no tiene permiso. Autenticacion sigue validando la
sesion y registrando su actividad; una denegacion no cambia usuarios, roles, permisos ni enlaces.

Roles y permisos efectivos se consultan en la base de datos en **cada peticion**, nunca en los
claims del JWT. Asignar o revocar un rol surte efecto en la peticion siguiente con el mismo
token; un rol inactivo no concede permisos. El arranque ya asigna todo el catalogo al rol
`ADMINISTRADOR`: no hay un bypass de permisos HTTP por nombre de rol.

**Ventana de revocacion en vuelo.** Los permisos se evaluan una vez, al inicio de cada peticion. Si a
un actor se le revoca un permiso (o el rol que lo concedia) mientras una peticion suya **ya
autorizada** esta en curso, esa peticion puede terminar y persistir su cambio; la siguiente
peticion con el mismo token recibe 403. Es el comportamiento esperado de una autorizacion por
peticion y no se reevalua dentro de la transaccion. Las protecciones de consistencia (ultimo
administrador, roles y permisos de sistema) si se comprueban bajo el lock, durante la escritura.

**Cuerpos invalidos.** En `PATCH /users/{id}` la ruta exige al menos `identity.users.update` o
`identity.users.deactivate` antes de validar el cuerpo, de modo que un actor sin ninguno recibe 403
aunque el cuerpo falte o sea invalido, igual que en roles y permisos. Un JSON mal formado responde
422 en los tres routers, porque FastAPI lo rechaza al leer el cuerpo, antes de cualquier
dependencia; no revela si el recurso existe.

### Limites anti-escalada (403)

La aplicacion recibe el DTO `AuthenticatedPrincipal` (usuario, roles y permisos), sin tipos
HTTP ni de persistencia, y verifica antes de escribir:

- Solo un actor con el rol efectivo `ADMINISTRADOR` puede asignar o revocar ese rol.
- Para asignar un rol a cualquier usuario (incluido uno mismo), el actor debe poseer **todos**
  los permisos del rol, incluso si el rol esta inactivo. `ADMINISTRADOR` queda exceptuado.
- Para asignar un permiso a un rol (incluido uno propio), el actor debe poseer ese permiso.
  `ADMINISTRADOR` queda exceptuado. Revocar un permiso o un rol ordinario no exige poseer los
  permisos revocados, solo el permiso de la accion y las protecciones de sistema existentes.
- Un actor sin el rol `ADMINISTRADOR` no puede editar, activar, desactivar ni eliminar usuarios
  que tengan ese rol, aunque el usuario objetivo este inactivo.

Estas denegaciones usan el mismo 403 generico y no dejan cambios parciales. Tener todos los
permisos `identity.*` sin el rol `ADMINISTRADOR` no elimina estos limites. Las reglas de
consistencia siguientes (409) siguen vigentes para operaciones autorizadas.

## Endpoints (`/api/v1`)

| Recurso | Operaciones |
| --- | --- |
| `/users` | `POST`, `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` |
| `/users/{id}/roles/{role_id}` | `PUT` asigna, `DELETE` revoca |
| `/roles` | `POST`, `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` |
| `/roles/{id}/permissions/{permission_id}` | `PUT` asigna, `DELETE` revoca |
| `/permissions` | `POST`, `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` |

Con permiso suficiente, `POST` responde 201, `DELETE` 204, un id inexistente 404 y una regla de
consistencia 409. Los
listados mantienen su cuerpo como un arreglo JSON y aceptan `limit` (1-100, por defecto 50),
`offset` (desde 0) y `q` opcional (maximo 100 caracteres). Se recortan los espacios al principio
y al final de `q`; vacio o solo espacios equivale a no filtrar. La busqueda es por contenido,
sin distinguir mayusculas y minusculas; `%`, `_` y `\` son caracteres literales, no comodines.

- Usuarios: `nombre_usuario`, `correo`, `primer_nombre`, `segundo_nombre`, `primer_apellido` y
  `segundo_apellido`.
- Roles: `codigo` y `nombre`.
- Permisos: `codigo`, `nombre` y `modulo`.

Cada listado devuelve `X-Total-Count`: el total que coincide con `q`, sin aplicar `limit` ni
`offset`, incluso si la pagina esta vacia. La cabecera esta expuesta por CORS para clientes en
otro origen. El orden es estable: usuarios por `nombre_usuario`, roles y permisos por `codigo`,
con `id` como desempate. Ejemplo: `GET /api/v1/users?q=ana&limit=10&offset=10`.
Una `q` de mas de 100 caracteres responde 422 sin reflejar el valor enviado.
Nunca se devuelve `hash_contrasena`.
El codigo de un rol o permiso es inmutable. Los errores 422 conservan `detail`, `loc` y `msg`,
pero nunca devuelven `input` ni `ctx`, para no exponer contrasenas ni otros datos enviados.
En `PATCH`, cualquier campo con `null` explicito se rechaza con 422; omitirlo significa no cambiarlo.
Al crear usuarios, `contrasena` debe tener 12-128 caracteres.

## Reglas de consistencia (409)

- No se puede eliminar, desactivar ni quitarle el rol `ADMINISTRADOR` al ultimo administrador
  activo. La comprobacion se hace bajo un advisory lock, de modo que dos peticiones simultaneas no
  pueden vaciar el rol.
- Nadie puede eliminar su propia cuenta.
- Los roles de sistema no se eliminan y `ADMINISTRADOR` no se desactiva.
- Un rol con usuarios asignados no se elimina; asignar roles y eliminar roles comparten el
  advisory lock `lock_access_changes`, con lecturas y conteos despues de adquirirlo.
- Los permisos del catalogo no se eliminan ni se revocan a `ADMINISTRADOR`.
- Un permiso asignado a algun rol no se elimina; asignar permisos y eliminar permisos comparten
  el mismo advisory lock para que el conteo vea las asignaciones confirmadas.
- Nombre de usuario, correo, codigo de rol y codigo de permiso son unicos.
- Crear y editar usuarios comparten `lock_access_changes` con el perfil: la comprobacion de
  identidad se hace despues del bloqueo y antes de escribir, en la misma transaccion. Las
  violaciones SQL de unicidad de usuario/correo en flush o commit se traducen a
  `409 {"detail": "El nombre de usuario o el correo ya estan registrados"}`.
- Eliminar un usuario borra en cascada sus sesiones y asignaciones; `asignado_por` en las
  asignaciones que hizo pasa a nulo.

## Pruebas

`tests/integration/test_access_initialization.py` cubre la siembra, su idempotencia y las
credenciales. `tests/integration/test_iam_administration.py` conserva CRUD, perfil de respuestas,
busqueda, paginacion, asignaciones y reglas 409. `tests/integration/test_granular_permissions.py`
cubre la matriz endpoint x permiso individual, todos los permisos, administrador, usuario sin rol
y peticion sin token; comprueba ausencia de cambios en cada denegacion, IDs inexistentes, PATCH
mixto, cambios de acceso con el mismo token, roles inactivos y limites anti-escalada.
