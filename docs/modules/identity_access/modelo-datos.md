# Modelo de datos (esquema `iam`)

Creado por `src/nexora/migrations/versions/0001_iam_schema.py`. Identificadores `UUID`, instantes
`TIMESTAMPTZ`, direcciones IP `INET`, nombres en `snake_case`.

## usuario

`id` (PK), `primer_nombre`, `segundo_nombre`, `primer_apellido`, `segundo_apellido`,
`nombre_usuario` (UNIQUE), `correo` (UNIQUE), `numero_telefono`, `hash_contrasena`,
`estado` (`activo`/`inactivo`, CHECK), `fecha_cambio_contrasena`, `fecha_creacion`,
`fecha_actualizacion`.

`hash_contrasena` guarda Argon2id. La contrasena en claro nunca se almacena ni se registra.
El correo no requiere verificacion y no existe recuperacion por correo electronico.

## rol

`id` (PK), `codigo` (UNIQUE), `nombre`, `descripcion`, `estado` (CHECK), fechas.
Un rol inactivo no aporta permisos.

## permiso

`id` (PK), `codigo` (UNIQUE), `nombre`, `descripcion`, `modulo`, fechas.

Catalogo controlado por el backend y sembrado por migracion:
`identity.users.view`, `identity.users.create`, `identity.users.update`,
`identity.users.deactivate`, `identity.users.reset_password`, `identity.roles.view`,
`identity.roles.create`, `identity.roles.update`, `identity.roles.assign_permissions`.
El cliente nunca define codigos de permiso.

## rol_permiso

PK compuesta (`rol_id`, `permiso_id`), ambas FK con `ON DELETE CASCADE`, mas `fecha_creacion`.
Sin identificador artificial. Indice adicional por `permiso_id`.

## asignacion_rol

PK compuesta (`usuario_id`, `rol_id`), que impide asignaciones duplicadas. `asignado_por` es FK
a `usuario` y es nulo solo en asignaciones iniciales del sistema (`ON DELETE SET NULL`).
Indice por `rol_id`.

## sesion

`id` (PK, es el `sid` del JWT), `usuario_id` (FK, indexado), `refresh_token_jti` (UNIQUE),
`direccion_ip` (`INET`), `agente_usuario`, `fecha_creacion`, `fecha_ultima_actividad`,
`fecha_vencimiento`, `fecha_revocacion`.

Solo se guarda el JTI del refresh token: **nunca el JWT completo**.

## Permisos efectivos

```sql
usuario -> asignacion_rol -> rol (estado = 'activo') -> rol_permiso -> permiso
```

Con varios roles, los permisos efectivos son la union de los permisos de los roles activos.
