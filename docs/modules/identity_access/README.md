# Modulo identity_access (IAM)

Contexto acotado de identidad y acceso de NEXORA: usuarios, credenciales, roles, permisos,
asignaciones y sesiones. Implementa el flujo de autenticacion y la administracion de acceso.

## Documentos

- [arquitectura.md](arquitectura.md): capas, dependencias y decisiones.
- [modelo-datos.md](modelo-datos.md): las seis tablas del esquema `iam` y sus reglas.
- [flujos-autenticacion.md](flujos-autenticacion.md): login, refresh, logout, logout-all y `me`.
- [contratos-api.md](contratos-api.md): endpoints, entradas y salidas.
- [perfil.md](perfil.md): perfil propio y cambio de contrasena para cualquier usuario autenticado.
- [administracion.md](administracion.md): siembra de roles, permisos y administrador; API de gestion.
- [seguridad.md](seguridad.md): controles aplicados y limitaciones conocidas.

## Requisitos funcionales cubiertos

| Requisito | Estado |
| --- | --- |
| Login con `nombre_usuario` o `correo` | Implementado |
| Error generico ante credenciales invalidas | Implementado |
| Usuario inactivo no puede autenticarse | Implementado |
| Access token JWT de 10 minutos (configurable) | Implementado |
| Refresh en cookie HttpOnly, techo de 7 dias limitado por el absoluto | Implementado |
| Sesion deslizante por actividad: 30 min idle, 12 h absoluto configurable | Implementado |
| Touch de requests con umbral de 60 s; refresh siempre registra actividad | Implementado |
| Rotacion atomica con JTI anterior y gracia configurable de 30 s | Implementado |
| Cierre global de sesiones propias por Bearer (`POST /auth/logout-all`) | Implementado |
| Deteccion de reutilizacion y revocacion de la sesion | Implementado |
| Revocacion inmediata verificada por `sid` en cada request | Implementado |
| Permisos efectivos por union de roles activos | Implementado |
| `require_permission` reutilizable | Implementado |
| Limitacion de intentos de login | Implementado (en memoria del proceso) |
| Siembra idempotente de roles, permisos y primer administrador | Implementado |
| CRUD de usuarios, roles y permisos solo para `ADMINISTRADOR` | Implementado |
| Proteccion del ultimo administrador activo | Implementado |
| Consulta y edicion del perfil propio para cualquier usuario autenticado | Implementado |
| Cambio de contrasena actual con throttle y cierre de otras sesiones | Implementado |
| Restablecimiento administrativo supervisado | Fuera de alcance de esta entrega |

## Politica de sesiones

La actividad conserva la sesion dentro del timeout de inactividad, pero nunca extiende
`fecha_vencimiento`. El access sigue durando 10 min: el cliente renueva por refresh ante
actividad real. Las opciones `NEXORA_SESSION_IDLE_TIMEOUT_MINUTES=30`,
`NEXORA_SESSION_ABSOLUTE_TIMEOUT_HOURS=12`, `NEXORA_REFRESH_ROTATION_GRACE_SECONDS=30`
y `NEXORA_SESSION_ACTIVITY_TOUCH_SECONDS=60` se validan al arrancar. Expiracion real y
reuso revocan en base antes del 401. La migracion reversible 0002 agrega los metadatos de
gracia y conserva el vencimiento de filas existentes. Detalles en [seguridad](seguridad.md)
y [modelo de datos](modelo-datos.md#migracion-0002).

## Requisitos no funcionales

- Monolito modular: `identity_access` no expone su infraestructura a otros modulos; el unico
  punto de entrada externo es su router y, a futuro, sus casos de uso.
- Persistencia asincrona de punta a punta (SQLAlchemy 2.x + psycopg async).
- El esquema evoluciona solo con Alembic; nunca con `create_all()`.
- Sin datos reales de pacientes ni credenciales personales en pruebas.
