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
`fecha_vencimiento`, `fecha_revocacion`, `refresh_token_jti_anterior` (UUID nullable),
`fecha_rotacion_refresh` (TIMESTAMPTZ nullable).

Solo se guardan los JTI vigente y anterior: **nunca el JWT completo**. El anterior se acepta
solo durante la gracia configurada desde `fecha_rotacion_refresh` (30 s por defecto).
Cada rotacion atomica copia vigente a anterior y actualiza vigente, rotacion y actividad.
Un JTI mas antiguo o anterior fuera de gracia provoca revocacion.

`fecha_vencimiento` es el tope absoluto (login + 12 h por defecto) y no cambia al refrescar.
`fecha_ultima_actividad` controla la inactividad deslizante (30 min por defecto); los requests
la actualizan como maximo cada 60 s y cada refresh valido la actualiza. Ambos limites son
estrictos: al alcanzarlos la sesion deja de ser usable y se persiste `fecha_revocacion`.

### Migracion 0002

`src/nexora/migrations/versions/0002_session_refresh_grace.py` sigue a `0001_iam_schema`.
Las dos columnas nullable distinguen concurrencia legitima/respuesta perdida de reutilizacion,
sin almacenar secretos. Upgrade agrega columnas y downgrade las elimina en orden inverso.
**Las filas existentes conservan su `fecha_vencimiento` actual**: no se recalcula ni se extiende.
Se les aplica inmediatamente la politica de inactividad; su primer refresh inicializa la gracia.
Nuevos logins usan el limite absoluto configurado. Antes de downgrade, detener la version de
la API que requiere estas columnas.

## Permisos efectivos

```sql
usuario -> asignacion_rol -> rol (estado = 'activo') -> rol_permiso -> permiso
```

Con varios roles, los permisos efectivos son la union de los permisos de los roles activos.
