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
| T2 Guard administrador + gestion de roles/permisos y asignaciones | S2, S5 | worker | ver commit feat(iam) admin api | hecho |
| T3 Gestion de usuarios y proteccion del ultimo admin | S2, S5 | worker | mismo commit que T2 | hecho |
| T4 Documentacion y verificacion final | S6 | inline | ver commits fix(iam) y docs(iam) | hecho |

## Log

- **L1** Solicitud original: "NEXORA — Inicializacion de roles, permisos y administrador.
  Implementa la inicializacion automatica del sistema de usuarios y autorizacion de NEXORA,
  respetando el modelo de datos y la arquitectura existente (DDD, Clean Architecture y monolito
  modular)." Metodologia: "Primero inspecciona el codigo ... Propon brevemente los cambios
  necesarios y despues implementa siguiendo ODD." "Verifica mediante pruebas la inicializacion, la
  asignacion de permisos y las restricciones de acceso para cada rol."
- **L2** Verificacion independiente (`gentle-ai-verify`) sobre 8d834cb..647bb45: S1-S3 y S5 incumplidos por
  cinco defectos reales, corregidos con pruebas de regresion (141 pruebas en verde):
  (D1) un 422 devolvia la contrasena enviada en `input`, tambien en login: handler global que
  elimina `input` y `ctx`; (D2) `PATCH` con `null` respondia 200 sin cambiar nada: ahora 422;
  (D3) en produccion la siembra podia terminar sin administrador efectivo (usuario o rol
  inactivo): ahora cuenta solo usuario y rol activos y aborta con rollback; (D4) carreras entre
  asignar y eliminar rol/permiso perdian la asignacion por cascada: el advisory lock
  `lock_access_changes` serializa esas operaciones y se relee despues de tomarlo; (D5) la
  contrasena inicial aceptaba mas de 128 caracteres que luego el login rechazaba. Ademas se oculta
  la contrasena en el `repr` de `NewUser`. Limitacion: la base de comparacion (`HEAD~2`) no pudo
  ejecutarse por un lanzador de pytest contaminado; los hallazgos estan confirmados contra HEAD, no
  clasificados contra la base. Riesgo residual: la siembra no reactiva usuarios ni roles inactivos.
