# NEXORA — Backend

Monolito modular en Python 3.14 con FastAPI, SQLAlchemy 2.x asincrono, PostgreSQL y Alembic.

## Modulos

- `identity_access`: identidad y acceso (IAM). Documentacion en
  [`docs/modules/identity_access/`](../docs/modules/identity_access/README.md).

## Puesta en marcha

Todo el stack en contenedores (desde la raiz del repositorio):

```bash
cp .env.template .env
docker compose up -d --build   # postgres -> migrate -> api
```

Desarrollo con recarga en caliente, con la base en Docker y la API local:

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

La plantilla completa es `.env.template` en la raiz; se copia a `.env` (no versionado), que leen
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
| `NEXORA_REFRESH_TOKEN_TTL_DAYS` | `7` | Vigencia del refresh token y de la sesion |
| `NEXORA_COOKIE_SAMESITE` | `lax` | `lax`, `strict` o `none` |
| `NEXORA_CSRF_COOKIE_PATH` | `/` | Ruta de la cookie CSRF legible por el front |
| `NEXORA_BOOTSTRAP_ADMIN_USERNAME` | — | Administrador inicial; obligatorio en produccion si no hay administrador |
| `NEXORA_BOOTSTRAP_ADMIN_EMAIL` | — | Correo del administrador inicial |
| `NEXORA_BOOTSTRAP_ADMIN_PASSWORD` | — | Contrasena inicial, 12 a 128 caracteres (Argon2id); ver `administracion.md` |
| `NEXORA_ALLOWED_ORIGINS` | `["http://localhost:5173"]` | Origenes de CORS y validacion CSRF |
| `NEXORA_LOGIN_MAX_ATTEMPTS` | `5` | Intentos antes del bloqueo |
| `NEXORA_LOGIN_ATTEMPT_WINDOW_SECONDS` | `300` | Ventana de conteo |
| `NEXORA_LOGIN_BLOCK_SECONDS` | `900` | Duracion del bloqueo |

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
