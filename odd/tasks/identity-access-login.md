# Feature: identity_access — Login vertical slice

Modulo `identity_access` del monolito modular NEXORA: primer flujo vertical de autenticacion
(login, refresh, logout, me) sobre el MER IAM aprobado, con Clean Architecture por capas.
Rama: `feature/develop`. Estado: en implementacion.

## Specs

- **S1** Stack obligatorio: "Python 3.14", "UV", "FastAPI", "SQLAlchemy 2.x", "PostgreSQL",
  "Alembic", "Pydantic v2", "Pytest", "Argon2id", "JWT". Persistencia asincrona consistente.
- **S2** Reglas de dependencias: "`domain` no debe depender de FastAPI, SQLAlchemy, PostgreSQL ni
  de frameworks externos"; `application` define contratos; `infrastructure` los implementa;
  `presentation` expone routers/schemas/dependencias; `bootstrap` compone.
- **S3** MER aprobado de 6 tablas en esquema `iam`: `usuario`, `rol`, `permiso`, `rol_permiso`,
  `asignacion_rol`, `sesion`, con los campos exactos del enunciado. UUID para identificadores,
  `TIMESTAMPTZ` para instantes, `INET` para `direccion_ip`, snake_case, PK compuestas sin id
  artificial en `rol_permiso` y `asignacion_rol`. "No crear tablas adicionales de recuperacion de
  contrasenas, tokens, credenciales o sesiones que dupliquen las responsabilidades de este modelo."
- **S4** Permisos: catalogo controlado por el backend, codigos tipo `identity.users.view`,
  `identity.users.create`, `identity.users.update`, `identity.users.deactivate`,
  `identity.users.reset_password`, `identity.roles.view`, `identity.roles.create`,
  `identity.roles.update`, `identity.roles.assign_permissions`. Permisos efectivos =
  "usuario -> asignacion_rol -> rol -> rol_permiso -> permiso", union de los roles activos.
- **S5** Access Token JWT de 10 minutos configurable, entregado en la respuesta y usado via
  `Authorization: Bearer`. Refresh Token JWT de 7 dias configurable, en cookie `HttpOnly`,
  `Secure` en produccion, `SameSite` definido, con proteccion CSRF y validacion de origen.
  "El frontend no debe tener acceso directo al contenido del Refresh Token."
- **S6** Claims: `sub`, `sid`, `jti`, `token_type`, `iss`, `aud`, `iat`, `exp`. Validar firma,
  algoritmo permitido, emisor, audiencia, expiracion y tipo de token. "No utilizar un algoritmo
  obtenido directamente del encabezado del token sin validacion."
- **S7** Rotacion de refresh: validar JWT, identificar sesion, comprobar no revocada ni vencida,
  comparar JTI con el almacenado, generar nuevo refresh, actualizar el JTI, de forma atomica.
  Ante reutilizacion de un refresh anterior, revocar la sesion. Endpoints protegidos verifican el
  estado de la sesion identificada por `sid`. La BD almacena solo el JTI, nunca el JWT completo.
- **S8** Login acepta `nombre_usuario` o `correo` como identificador. "Ante credenciales
  incorrectas, devolver un mensaje generico. No revelar si el usuario existe, esta inactivo o si la
  contrasena es incorrecta." Limitacion de intentos contra fuerza bruta. "No registrar contrasenas,
  hashes, JWT completos, cookies ni secretos en logs."
- **S9** Endpoints bajo `/api/v1`: `POST /api/v1/auth/login` (entrada `identificador`,
  `contrasena`), `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
  Schemas Pydantic propios. "Nunca serializar directamente modelos ORM ni exponer campos internos
  como `hash_contrasena` o `refresh_token_jti`."
- **S10** Autorizacion reutilizable: identificar usuario autenticado, validar sesion, obtener
  permisos efectivos y exigir permiso, estilo `require_permission("identity.users.view")`.
  "No incluir permisos permanentes en el JWT si eso provoca que los cambios de autorizacion queden
  desactualizados."
- **S11** Persistencia: separar modelos ORM, entidades de dominio, repositorios y mapeadores.
  "No hacer que las entidades de dominio hereden de modelos ORM." Transacciones atomicas para
  creacion de sesion y rotacion. Evitar N+1 con carga explicita.
- **S12** Alembic unico mecanismo de evolucion del esquema. "No utilizar `Base.metadata.create_all()`
  como estrategia de despliegue." Migraciones revisables, con downgrade revisado.
- **S13** Pruebas minimas: login correcto, usuario inexistente, contrasena incorrecta, usuario
  inactivo, login por correo, login por nombre de usuario, creacion de sesion, validacion de access
  token, refresh valido, refresh expirado, refresh revocado, reutilizacion de refresh, logout,
  sesion revocada, usuario sin permisos, usuario con multiples roles, permiso concedido y denegado.
  Verificar limites de arquitectura.
- **S14** Documentacion del modulo en `docs/modules/identity_access/`. Documentacion funcional en
  espanol; nombres tecnicos del codigo en ingles.
- **S15** Decisiones aprobadas por el usuario en Fase 2 (ver L2): (a) tablas y columnas en espanol
  segun el MER, atributos ORM y dominio en ingles via `mapped_column("primer_nombre")`;
  (b) rate limiting in-process por IP + identificador, sin dependencias nuevas ni tablas nuevas;
  (c) `POST /auth/login` devuelve solo el usuario minimo, roles y permisos via `GET /auth/me`;
  (d) `backend/docker-compose.yml` con PostgreSQL de desarrollo y de tests.

## Tasks

| ID | Specs | Ruta | Commit | Estado |
| --- | --- | --- | --- | --- |
| T1 Base del backend | S1, S2 | inline | `31c7b4e` | hecho |
| T2 Esquema iam + Alembic | S3, S4, S11, S12 | inline | `d3064b6` | hecho |
| T3 Dominio, puertos y LoginUseCase | S2, S8, S13 | inline | `c197a0a` | hecho |
| T4 Infraestructura (repos, Argon2id, JWT) | S1, S5, S6, S11 | inline | `88f2316` | hecho |
| T5/T6a Casos de uso refresh/logout/me | S5, S6, S7, S13 | inline | `7df54cd` | hecho |
| T5/T6b Endpoints HTTP y CSRF | S8, S9, S10, S13 | inline | `c89842f` | hecho |
| T7/T8 Documentacion y verificacion final | S12, S13, S14 | inline | pendiente de commit | hecho |

Cada fila es una rebanada de trabajo revisable y commiteada por separado en `feature/develop`.
Push, pull request y merge quedan como decision del usuario.

## Log

- **L1** Solicitud original del usuario: "NEXORA — Diseno e implementacion del modulo Identity &
  Access Management (IAM)": actuar como Senior Backend Engineer y Software Architect, iniciar el
  modulo `identity_access` por el flujo de Login sobre un monolito modular con DDD y Clean
  Architecture, respetando el MER de 6 tablas, el stack obligatorio (Python 3.14, UV, FastAPI,
  SQLAlchemy 2.x, PostgreSQL, Alembic, Pydantic v2, Pytest, Argon2id, JWT), los endpoints
  `/api/v1/auth/{login,refresh,logout,me}`, la estrategia de seguridad (Argon2id, cookies
  HttpOnly, CSRF, rotacion y revocacion de refresh, permisos en backend), pruebas, documentacion en
  `docs/modules/identity_access/` y trabajo por fases ODD, sin microservicios, sin recuperacion por
  correo, sin `create_all()`, sin abstracciones por formalismo.
- **L2** Fase 2 aprobada por el usuario con la respuesta "dale con tus recomendaciones", fijando las
  cuatro decisiones de S15.
- **L4** Verificacion final: 85 pruebas en verde (unitarias, de integracion y de API contra
  PostgreSQL real), `ruff check`/`ruff format --check` limpios, `mypy` estricto sin errores,
  migracion verificada desde base vacia y en ciclo upgrade/downgrade/upgrade, OpenAPI generado
  con las cuatro rutas de `/api/v1/auth` y sin filtrar `hash_contrasena` ni `refresh_token_jti`.
- **L3** Exploracion Fase 1: repositorio greenfield, sin `AGENTS.md`, sin dependencias en
  `pyproject.toml`/`uv.lock`, sin FastAPI/SQLAlchemy/Alembic, sin `bootstrap`, `shared_kernel` ni
  `audit`, `identity_access` solo con carpetas vacias no versionadas. Engram no disponible
  (binario `engram` ausente), sin memoria previa del proyecto.
