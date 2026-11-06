# Feature: iam-bootstrap-admin — Inicializacion de roles/permisos/administrador y gestion IAM

Extiende `identity_access`: siembra idempotente al arrancar y API de administracion exclusiva del
rol `ADMINISTRADOR`. Rama: `feature/develop`. Estado: en implementacion.

## Specs

- **S1** "Garantizar mediante un proceso idempotente que existan los siguientes roles:
  `ADMINISTRADOR`, `ESTADISTICA`, `FACTURACION`." Inicializar el catalogo de permisos y sus
  relaciones en `rol_permiso`; crear el primer usuario administrador y registrar su rol en
  `asignacion_rol`. Quedan pobladas `usuario`, `rol`, `permiso`, `rol_permiso`, `asignacion_rol`.
- **S2** "El rol `ADMINISTRADOR` sera el unico autorizado para": crear/listar/editar/eliminar
  usuarios; crear/listar/editar/eliminar roles; crear/listar/editar/eliminar permisos;
  asignar/revocar roles a usuarios; asignar/revocar permisos a roles. "Validarse siempre en el
  backend, no solamente en el frontend."
- **S3** Credenciales iniciales del administrador por variables de entorno; contrasena con
  Argon2id; "Nunca incluir credenciales predeterminadas en el codigo."
- **S4** Inicializacion "transaccional e idempotente, sin duplicar registros en cada inicio";
  "Respetar las migraciones de Alembic y la estructura existente."
- **S5** "Impedir la eliminacion o desactivacion del ultimo administrador activo." "Proteger las
  relaciones existentes y evitar eliminaciones que generen inconsistencias."
- **S6** "No dupliques funcionalidades, no alteres decisiones arquitectonicas aprobadas y no escribas
  codigo innecesario." Pruebas de inicializacion, asignacion de permisos y restricciones por rol.

## Decisiones de diseno (propuestas por el agente, no del usuario)

- D1 Guard `require_administrator`: exige el rol `ADMINISTRADOR` activo (por codigo de rol), no solo
  un permiso, para que un admin no pueda delegar la gestion IAM otorgando permisos a otro rol.
- D2 Catalogo de permisos IAM en codigo (fuente unica); la siembra hace upsert por `codigo` y
  asigna todos al rol `ADMINISTRADOR`. `ESTADISTICA` y `FACTURACION` quedan sin permisos hasta que
  existan sus modulos.
- D3 Credenciales: `NEXORA_BOOTSTRAP_ADMIN_{USERNAME,EMAIL,PASSWORD}`; si faltan en desarrollo no
  se crea admin (aviso en log); si faltan en produccion y no hay admin, el arranque falla.
- D4 Eliminar = borrado real, con guardas: rol con asignaciones o rol de sistema no se borra;
  permiso asignado a un rol no se borra; usuario: nunca el ultimo admin activo ni a uno mismo.

## Tasks

| ID | Specs | Ruta | Commit | Estado |
| --- | --- | --- | --- | --- |
| T1 Siembra idempotente (settings, caso de uso, arranque) | S1, S3, S4 | inline | ver ultimo commit feat(iam) seed | hecho |
| T2 Guard administrador + gestion de roles/permisos y asignaciones | S2, S5 | inline | - | pendiente |
| T3 Gestion de usuarios y proteccion del ultimo admin | S2, S5 | inline | - | pendiente |
| T4 Documentacion y verificacion final | S6 | inline | - | pendiente |

## Log

- **L1** Solicitud original: "NEXORA — Inicializacion de roles, permisos y administrador.
  Implementa la inicializacion automatica del sistema de usuarios y autorizacion de NEXORA,
  respetando el modelo de datos y la arquitectura existente (DDD, Clean Architecture y monolito
  modular)." Metodologia: "Primero inspecciona el codigo ... Propon brevemente los cambios
  necesarios y despues implementa siguiendo ODD." "Verifica mediante pruebas la inicializacion, la
  asignacion de permisos y las restricciones de acceso para cada rol."
