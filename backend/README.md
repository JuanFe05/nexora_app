# NEXORA — Backend

Monolito modular en Python 3.14 con FastAPI, SQLAlchemy 2.x asincrono, PostgreSQL y Alembic.

## Modulos

- `identity_access`: identidad y acceso (IAM). Documentacion en
  [`docs/modules/identity_access/`](../docs/modules/identity_access/README.md).

## Puesta en marcha

Todo el stack en contenedores (desde la raiz del repositorio):

```bash
cp .env.development.template .env
docker compose up -d --build   # postgres -> migrate -> api
```

Desarrollo local, con la base en Docker y la API local (sin recarga automatica: reinicia `main.py` tras cambiar codigo):

```bash
cd backend
uv sync --all-groups                      # instala dependencias
(cd .. && docker compose up -d postgres)  # PostgreSQL de desarrollo en el puerto 45336
uv run alembic upgrade head               # aplica las migraciones
uv run python main.py                     # API en http://127.0.0.1:8000 (OpenAPI en /docs)
```

La imagen (`backend/Dockerfile`) es multi-stage: instala las dependencias desde `uv.lock` con uv
y ejecuta la API con el usuario sin privilegios `nexora`. La configuracion llega siempre por
variables de entorno, nunca horneada en la imagen.

## Calidad

```bash
uv run pytest -q              # pruebas unitarias, de integracion y de API
uv run ruff check src tests   # lint
uv run ruff format src tests  # formato
uv run mypy                   # tipado estatico
```

Las pruebas de integracion necesitan el contenedor `postgres-test` (puerto 45337), que vive bajo
un profile para no levantarse en produccion:

```bash
(cd .. && docker compose --profile test up -d postgres-test)
```

Aplican las migraciones desde una base vacia en cada ejecucion. La conexion sale de
`NEXORA_TEST_DATABASE_URL`: primero la variable de entorno (lo que usa CI) y, si no esta, el
`.env` de la raiz.

## Variables de entorno

Las plantillas completas son `.env.development.template` y `.env.production.template` en la raiz; se copia a `.env` (no versionado), que leen
tanto Docker Compose como Pydantic Settings. Las variables de la aplicacion usan el prefijo
`NEXORA_`; las de infraestructura configuran el compose.

### Infraestructura (Docker Compose)

| Variable | Valor por defecto | Descripcion |
| --- | --- | --- |
| `POSTGRES_USER` | `nexora` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | — (obligatoria) | Clave de PostgreSQL |
| `POSTGRES_DB` | `nexora` | Base de datos de la aplicacion |
| `POSTGRES_TEST_DB` | `nexora_test` | Base de datos de pruebas |
| `POSTGRES_HOST_PORT` | `45336` | Puerto publicado de la base (en produccion, `127.0.0.1:45336` o ninguno) |
| `POSTGRES_TEST_HOST_PORT` | `45337` | Puerto publicado de la base de pruebas |
| `API_HOST_PORT` | `45335` | Puerto publicado de la API |
| `API_WORKERS` | `1` | Procesos de uvicorn (en produccion, segun CPU) |
| `RESTART_POLICY` | `unless-stopped` | Politica de reinicio de los servicios |
| `NEXORA_IMAGE_TAG` | `local` | Etiqueta de la imagen del backend |

### Aplicacion

Todas usan el prefijo `NEXORA_`.

| Variable | Valor por defecto | Descripcion |
| --- | --- | --- |
| `NEXORA_ENVIRONMENT` | `development` | `development`, `testing` o `production` |
| `NEXORA_DATABASE_URL` | `postgresql+psycopg://nexora:nexora@localhost:45336/nexora` | Conexion asincrona |
| `NEXORA_TEST_DATABASE_URL` | `postgresql+psycopg://nexora:nexora@localhost:45337/nexora_test` | Base de pruebas |
| `NEXORA_JWT_SECRET` | secreto de desarrollo | Obligatorio y de 32+ caracteres en produccion |
| `NEXORA_JWT_ALGORITHM` | `HS256` | Solo `HS256`, `HS384` o `HS512` |
| `NEXORA_JWT_ISSUER` | `nexora` | Claim `iss` |
| `NEXORA_JWT_AUDIENCE` | `nexora-app` | Claim `aud` |
| `NEXORA_ACCESS_TOKEN_TTL_MINUTES` | `10` | Vigencia del access token |
| `NEXORA_REFRESH_TOKEN_TTL_DAYS` | `7` | Techo del refresh JWT, limitado por el absoluto de sesion |
| `NEXORA_SESSION_IDLE_TIMEOUT_MINUTES` | `30` | Inactividad deslizante, 1-1440 min; no puede superar el absoluto, debe ser mayor que el access TTL y al menos el doble del umbral de actividad |
| `NEXORA_SESSION_ABSOLUTE_TIMEOUT_HOURS` | `12` | Tope desde login que no se extiende, 1-168 h |
| `NEXORA_SESSION_WARNING_SECONDS` | `120` | Aviso previo, 10-600 s inclusivos y estrictamente menor que la inactividad en segundos; se recomienda como maximo la mitad de esa ventana |
| `NEXORA_REFRESH_ROTATION_GRACE_SECONDS` | `30` | Gracia para JTI anterior, 1-300 s |
| `NEXORA_SESSION_ACTIVITY_TOUCH_SECONDS` | `60` | Umbral entre escrituras de actividad por request, 1-300 s |
| `NEXORA_COOKIE_SAMESITE` | `lax` | `lax`, `strict` o `none` |
| `NEXORA_CSRF_COOKIE_PATH` | `/` | Ruta de la cookie CSRF legible por el front |
| `NEXORA_BOOTSTRAP_ADMIN_USERNAME` | — | Administrador inicial; obligatorio en produccion si no hay administrador |
| `NEXORA_BOOTSTRAP_ADMIN_EMAIL` | — | Correo del administrador inicial |
| `NEXORA_BOOTSTRAP_ADMIN_PASSWORD` | — | Contrasena inicial, 6-24 code points Unicode con mayuscula, minuscula, numero y especial (Argon2id); ver politica abajo |
| `NEXORA_ALLOWED_ORIGINS` | `["http://localhost:5173"]` | Origenes de CORS y validacion CSRF |
| `NEXORA_LOGIN_MAX_ATTEMPTS` | `5` | Intentos antes del bloqueo |
| `NEXORA_LOGIN_ATTEMPT_WINDOW_SECONDS` | `300` | Ventana de conteo |
| `NEXORA_LOGIN_BLOCK_SECONDS` | `900` | Duracion del bloqueo |

### Sesiones y cierre global

La entidad `Session` usa el instante del reloj inyectado: no revocada, ahora < vencimiento
absoluto y tiempo desde ultima actividad < timeout idle. Login fija el absoluto; refresh
nunca lo extiende y emite `exp = min(ahora + TTL refresh, absoluto)`. Un request valido
registra actividad cada >= umbral; un refresh valido siempre la registra. Expiracion idle o
absoluta revoca y confirma antes del 401. El access conserva 10 min y puede renovarse si la
sesion sigue activa; el cliente solo debe refrescar ante actividad real.

`POST /api/v1/auth/login` y `POST /api/v1/auth/refresh` conservan `access_token`,
`token_type` y `expires_in` y agregan:

- `idle_timeout_seconds`: entero, inactividad configurada en segundos (default `1800`).
- `warning_seconds`: entero, ventana de aviso configurada (default `120`).
- `session_expires_at`: cadena ISO-8601 UTC, `fecha_vencimiento` absoluta de la sesion;
  no es el vencimiento del access ni del refresh JWT y nunca se extiende al renovar.

El cliente usa estos valores para avisar antes del cierre por inactividad, sin duplicar
configuracion ni aumentar los TTL. El aviso no cambia las reglas de validez del servidor.
`GET /api/v1/auth/me` conserva su contrato de usuario, roles y permisos.

El UPDATE atomico de refresh acepta el JTI vigente o anterior en gracia (30 s inclusivos),
y guarda vigente como anterior, nuevo JTI, fecha de rotacion y actividad. Esto tolera dos
refresh concurrentes y un reintento por respuesta perdida; un JTI mas antiguo o fuera de
gracia revoca. Solo hay una generacion anterior, no una ventana de tokens ilimitada.

`POST /api/v1/auth/logout-all`: Bearer, sin cuerpo ni CSRF, 204 vacio. Revoca todas las
sesiones propias, incluida la actual, en una transaccion y reutiliza el borrado de cookies
(refresh `/api/v1/auth`, CSRF `/`). Otros usuarios no cambian. Sin autenticacion valida: 401.
Ver [contrato API](../docs/modules/identity_access/contratos-api.md).

### Gestion de sesiones propias desde el perfil

- `GET /api/v1/profile/sessions`: Bearer, sin permiso extra; `200 {"items": [...]}`.
  Solo sesiones propias usables segun `Session` (no revocadas, dentro del absoluto e idle).
  Campos: `id`, `direccion_ip`, `agente_usuario`, `fecha_creacion`,
  `fecha_ultima_actividad`, `fecha_vencimiento`, `actual`. IP/agente admiten `null`, fechas
  ISO-UTC; actual primero, luego ultima actividad descendente. `actual` compara con el ID
  de sesion del principal; nunca expone JTI, hashes ni tokens.
- `DELETE /api/v1/profile/sessions/{id}`: revoca otra sesion propia usable en una
  transaccion con los locks existentes; `204` vacio sin borrar cookies. Sus access/refresh
  dejan de funcionar. ID inexistente, ajeno o no usable: `404` con el mismo mensaje
  `Recurso no encontrado`. Sesion actual: `409` con
  `Para cerrar la sesion actual, use «Cerrar sesión»`; permanece viva.
- Ambas rutas: `401` sin autenticacion valida; sin permisos administrativos ni migraciones.

Detalles en [perfil](../docs/modules/identity_access/perfil.md) y
[contratos API](../docs/modules/identity_access/contratos-api.md).

### Politica de contrasenas nuevas

Crear usuarios, cambiar la contrasena y configurar el administrador inicial exige **6-24
code points Unicode**, al menos una mayuscula (`Lu`), una minuscula (`Ll`), un numero (`Nd`)
y un especial (categoria `P*` o `S*`, por ejemplo `@ # $ % & !`). No se recortan espacios:
cuentan para la longitud, pero no satisfacen el requisito de especial.

La fuente unica del backend es
`src/nexora/identity_access/domain/value_objects/password_policy.py`. Los errores HTTP son
422 sin eco de secretos. Login y contrasena **actual** siguen admitiendo claves legacy de
1-128 caracteres sin exigir esta politica. La nueva ademas debe ser diferente de la actual.
Argon2id y el almacenamiento no cambian. No hay endpoint de restablecimiento administrativo;
cuando se implemente, debe reutilizar este mismo modulo. Detalles en
[seguridad.md](../docs/modules/identity_access/seguridad.md#politica-de-contrasenas).

`NEXORA_JWT_SECRET` se genera con:

```bash
uv run python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Migraciones

```bash
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic revision -m "descripcion"   # revisar siempre el archivo generado
```

Alembic es el unico mecanismo de evolucion del esquema: no se usa `Base.metadata.create_all()`
ni se modifica la base a mano.

`0002_session_refresh_grace` sigue a `0001_iam_schema`: agrega en `iam.sesion`
`refresh_token_jti_anterior` (UUID nullable) y `fecha_rotacion_refresh` (TIMESTAMPTZ nullable),
necesarios para distinguir concurrencia legitima de reuso. **Las filas existentes conservan
su `fecha_vencimiento` actual** y reciben la politica idle; nuevos logins usan el absoluto
configurado. Downgrade elimina solo esas columnas; detener antes la API que las requiere.

Para comprobar ida/vuelta, apuntar explicitamente a la base de pruebas mediante
`alembic -x url=<NEXORA_TEST_DATABASE_URL>` y ejecutar `upgrade head`, `downgrade -1`,
`upgrade head`. Nunca usar la base de desarrollo o produccion para esa comprobacion.
