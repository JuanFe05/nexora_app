# Contratos de API (v1)

Prefijo: `/api/v1`. Errores con forma `{"detail": "<mensaje>"}`.

## POST /api/v1/auth/login

Entrada:

```json
{ "identificador": "jperez", "contrasena": "********" }
```

`contrasena` admite 1-128 caracteres, incluidas claves legacy sin los requisitos para claves
nuevas. No se recortan espacios.

Salida `200`:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 600,
  "usuario": {
    "id": "uuid",
    "nombre_usuario": "jperez",
    "correo": "jperez@nexora.co",
    "nombre_completo": "Juan Perez"
  }
}
```

Ademas establece `nexora_refresh_token` (`HttpOnly`, `Path=/api/v1/auth`) y
`nexora_csrf_token` (legible por el front, `Path=/`, configurable con
`NEXORA_CSRF_COOKIE_PATH`). Roles y permisos se consultan en `GET /auth/me`.
El refresh vence como maximo al limite absoluto de sesion (12 h desde login por defecto),
aunque su TTL configurado siga siendo 7 dias como techo.

Errores: `401` credenciales invalidas (usuario inexistente, inactivo o contrasena incorrecta),
`422` cuerpo invalido, `429` demasiados intentos (con `Retry-After`).

## POST /api/v1/auth/refresh

Sin cuerpo. Requiere la cookie de refresh y la cabecera `X-CSRF-Token` igual a la cookie CSRF.

Salida `200`: `{"access_token": "<jwt>", "token_type": "bearer", "expires_in": 600}` y cookies
rotadas. Acepta JTI vigente o anterior dentro de 30 s de la ultima rotacion (configurable).
Un duplicado concurrente o reintento por respuesta perdida puede tener exito en esa ventana;
un JTI mas antiguo o anterior fuera de gracia revoca la sesion.
Cada refresh valido cuenta como actividad, pero nunca extiende el vencimiento absoluto.
Errores: `401` por falta de CSRF, origen no permitido, token invalido o vencido, sesion
revocada, vencida por inactividad/absoluto (`"Sesion no activa"`) o refresh reutilizado
(`"Refresh token reutilizado"`). Expiracion y reuso se confirman como revocacion antes del 401.

## POST /api/v1/auth/logout

Sin cuerpo. Requiere CSRF si hay cookie de refresh. Salida `204` y cookies borradas.

## POST /api/v1/auth/logout-all

Cabecera `Authorization: Bearer <access_token>`. Sin cuerpo. No exige CSRF ni cookie de
refresh: autentica por el principal Bearer, sin permisos adicionales.

Salida `204`, cuerpo vacio. Revoca **todas** las sesiones del usuario autenticado (incluida
la actual) en una transaccion; las de otros usuarios no cambian. Borra refresh en
`/api/v1/auth` y CSRF en `/` usando los mismos atributos de logout. Access y refresh viejos
son rechazados desde la siguiente peticion. Errores: `401` sin Bearer valido, usuario
inactivo o sesion no activa; no borra cookies ni revoca otras sesiones si falla autenticacion.

## GET /api/v1/auth/me

Cabecera `Authorization: Bearer <access_token>`.

```json
{
  "usuario": { "id": "uuid", "nombre_usuario": "jperez", "correo": "jperez@nexora.co",
               "nombre_completo": "Juan Perez" },
  "roles": ["admin_usuarios"],
  "permisos": ["identity.users.view"]
}
```

Errores: `401` sin token, token invalido o vencido, sesion revocada, inactiva/vencida o usuario
desactivado. Todos los endpoints protegidos aplican inactividad de 30 min y absoluto de 12 h,
configurables. Actualizan actividad solo cada >= 60 s; alcanzar cualquiera de los limites
revoca y confirma antes del 401. Un access vencido con sesion activa puede renovarse por refresh.

## Administracion IAM (permisos por accion)

`/users`, `/roles` y `/permissions` requieren el permiso efectivo de la accion, no un rol
exclusivo. [Tabla endpoint -> permiso](administracion.md#autorizacion). Los codigos mantienen
`identity.*`: consultar, crear, editar y eliminar no se implican entre si. Las asignaciones
requieren `identity.users.assign_roles` o `identity.roles.assign_permissions`, sin exigir `view`.

En `PATCH /users/{id}`, campos distintos de `estado` requieren `identity.users.update`; solo
`estado` requiere `identity.users.deactivate`; mezclar ambos requiere ambos permisos. `{}`
conserva su comportamiento sin cambios y requiere `identity.users.update`.

Sin token: `401`. Sin permiso: `403 {"detail": "No tiene permisos para ejecutar esta operacion"}`
antes de buscar el recurso, incluso con IDs inexistentes; no hay cambios administrativos.
Con permiso, un recurso inexistente responde `404` y las protecciones de consistencia `409`.
La aplicacion tambien responde ese mismo `403` cuando un actor intenta delegar un permiso no
poseido (directamente o mediante un rol). Solo `ADMINISTRADOR` puede asignar/revocar su rol y
editar/desactivar/eliminar usuarios administradores; este rol queda exceptuado del limite de
permisos delegables. Las protecciones del ultimo administrador y de sistema se conservan.

Roles y permisos se recargan desde la base en cada peticion con el mismo token. Una asignacion o
revocacion rige desde la **peticion siguiente**; una peticion ya autorizada y en curso puede
terminar tras la revocacion (ver `administracion.md`). Los roles inactivos no conceden acceso.

### Roles: usuarios asignados

Cada objeto de rol en `GET /roles`, `GET /roles/{id}`, `POST /roles`, `PATCH /roles/{id}`
y `PUT /roles/{id}/permissions/{permission_id}` incluye `usuarios_asignados`, un entero
no negativo (`0` sin asignaciones). Los demas campos no cambian:

```json
{
  "id": "uuid", "codigo": "CUSTOM", "nombre": "Custom", "descripcion": null,
  "estado": "activo", "permisos": [], "usuarios_asignados": 0
}
```

Cuenta usuarios distintos con una asignacion en `iam.asignacion_rol`, incluidos usuarios
inactivos y asignaciones a roles inactivos; no mide permisos efectivos. Eliminar un usuario
borra sus asignaciones en cascada y reduce el contador. Asignar o revocar mediante
`PUT` / `DELETE /users/{id}/roles/{role_id}` se refleja en la siguiente consulta, sin cache.
El campo es de solo lectura: no se acepta en cuerpos de creacion o edicion.

`GET /roles` conserva el arreglo JSON, `X-Total-Count` (total de roles, no de usuarios),
`limit`, `offset`, `q`, busqueda literal y orden por `codigo`, `id`.

### Contrasena al crear usuarios

`POST /api/v1/users` exige en `contrasena` 6-24 code points Unicode, una mayuscula (`Lu`),
una minuscula (`Ll`), un numero (`Nd`) y un especial (`P*` o `S*`, como `@ # $ % & !`). No
recorta espacios; los espacios no son especiales. Una clave invalida produce 422 sin `input`
ni `ctx`, con un mensaje que nombra las reglas incumplidas. Bootstrap y cambio de clave usan
la misma fuente de backend: `domain/value_objects/password_policy.py`.
No hay endpoint de reset administrativo; uno futuro debe reutilizar ese modulo.

## Perfil propio (cualquier usuario autenticado)

Los tres endpoints requieren `Authorization: Bearer <access_token>`; sin token valido responden
`401`. No requieren rol ni permiten indicar otro usuario. Detalles y decisiones en
[perfil.md](perfil.md).

### GET /api/v1/profile

Salida `200`:

```json
{
  "id": "uuid", "nombre_usuario": "jperez", "correo": "jperez@nexora.co",
  "primer_nombre": "Juan", "segundo_nombre": null, "primer_apellido": "Perez",
  "segundo_apellido": null, "numero_telefono": null, "estado": "activo", "roles": []
}
```

Nunca incluye `hash_contrasena` ni sesiones.

### PATCH /api/v1/profile

Entrada parcial: `correo`, `primer_nombre`, `segundo_nombre`, `primer_apellido`,
`segundo_apellido`, `numero_telefono`. Salida `200`: el mismo perfil actualizado.

Campos omitidos no cambian; `null`, cadenas vacias, formatos/longitudes invalidos y campos
no permitidos producen `422`. `nombre_usuario` es de solo lectura; tampoco se aceptan `id`,
`estado`, `roles` ni hashes. Correo duplicado de otro usuario sin distinguir mayusculas:
`409`; el correo actual propio no es conflicto.

### POST /api/v1/profile/password

Entrada: `{"contrasena_actual": "<actual>", "contrasena_nueva": "<nueva>"}`.
Actual de 1-128 caracteres, incluidas claves legacy sin requisitos de composicion.
Nueva de 6-24 code points Unicode con mayuscula (`Lu`), minuscula (`Ll`), numero (`Nd`) y
especial (`P*` o `S*`, como `@ # $ % & !`), diferente de la actual. No se recortan espacios;
no cuentan como especial. La validacion definitiva usa el mismo modulo unico que crear
usuarios y bootstrap. Salida `204` sin cuerpo.
El hash y la fecha se actualizan atomicamente con la revocacion de las otras sesiones;
la sesion del solicitante permanece activa.

Errores: `400 {"detail": "La contrasena actual es incorrecta"}` (no dispara refresh),
`429` con `Retry-After` por intentos fallidos acumulados por usuario, `422` por entrada invalida.
Ningun error devuelve las contrasenas enviadas.

## Claims del JWT

`sub` (usuario), `sid` (sesion), `jti`, `token_type` (`access` o `refresh`), `iss`, `aud`,
`iat`, `exp`. Nunca contienen permisos ni datos personales.
