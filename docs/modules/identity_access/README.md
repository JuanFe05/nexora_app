# Modulo identity_access (IAM)

Contexto acotado de identidad y acceso de NEXORA: usuarios, credenciales, roles, permisos,
asignaciones y sesiones. Implementa el flujo de autenticacion y la administracion de acceso.

## Documentos

- [arquitectura.md](arquitectura.md): capas, dependencias y decisiones.
- [modelo-datos.md](modelo-datos.md): las seis tablas del esquema `iam` y sus reglas.
- [flujos-autenticacion.md](flujos-autenticacion.md): login, refresh, logout y `me`.
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
| Refresh token de 7 dias en cookie HttpOnly (configurable) | Implementado |
| Rotacion atomica del refresh token | Implementado |
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

## Requisitos no funcionales

- Monolito modular: `identity_access` no expone su infraestructura a otros modulos; el unico
  punto de entrada externo es su router y, a futuro, sus casos de uso.
- Persistencia asincrona de punta a punta (SQLAlchemy 2.x + psycopg async).
- El esquema evoluciona solo con Alembic; nunca con `create_all()`.
- Sin datos reales de pacientes ni credenciales personales en pruebas.
