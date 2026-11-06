# Administracion de acceso e inicializacion

Siembra automatica de roles, permisos y primer administrador, y API de administracion de
usuarios, roles y permisos. Toda la gestion es exclusiva del rol `ADMINISTRADOR`.

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

Cada endpoint de administracion usa `require_administrator`, que exige el **rol** `ADMINISTRADOR`
activo del usuario autenticado (no un permiso). Asi, un administrador no puede delegar la gestion
de identidad otorgando permisos `identity.*` a otro rol: esos usuarios siguen recibiendo 403. Sin
token la respuesta es 401.

## Endpoints (`/api/v1`)

| Recurso | Operaciones |
| --- | --- |
| `/users` | `POST`, `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` |
| `/users/{id}/roles/{role_id}` | `PUT` asigna, `DELETE` revoca |
| `/roles` | `POST`, `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` |
| `/roles/{id}/permissions/{permission_id}` | `PUT` asigna, `DELETE` revoca |
| `/permissions` | `POST`, `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` |

`POST` responde 201, `DELETE` 204, un id inexistente 404 y una regla de consistencia 409. Los
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
credenciales. `tests/integration/test_iam_administration.py` cubre el acceso de cada rol
(`ADMINISTRADOR` permitido; `ESTADISTICA`, `FACTURACION` y un usuario con todos los permisos
`identity.*` reciben 403), el efecto de asignar permisos sobre `GET /auth/me` y las reglas 409.
