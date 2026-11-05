# NEXORA — Backend

Monolito modular en Python 3.14 con FastAPI, SQLAlchemy 2.x asincrono, PostgreSQL y Alembic.

## Modulos

- `identity_access`: identidad y acceso (IAM). Documentacion en
  [`docs/modules/identity_access/`](../docs/modules/identity_access/README.md).

## Puesta en marcha

```bash
cd backend
uv sync --all-groups          # instala dependencias
docker compose up -d          # PostgreSQL de desarrollo (5434) y de pruebas (5433)
uv run alembic upgrade head   # aplica las migraciones
uv run python main.py         # API en http://127.0.0.1:8000 (OpenAPI en /docs)
```

## Calidad

```bash
uv run pytest -q              # pruebas unitarias, de integracion y de API
uv run ruff check src tests   # lint
uv run ruff format src tests  # formato
uv run mypy                   # tipado estatico
```

Las pruebas de integracion necesitan el contenedor `postgres-test` (puerto 5433) y aplican las
migraciones desde una base vacia en cada ejecucion.

## Variables de entorno

Todas usan el prefijo `NEXORA_` y pueden definirse en `backend/.env` (no versionado).

| Variable | Valor por defecto | Descripcion |
| --- | --- | --- |
| `NEXORA_ENVIRONMENT` | `development` | `development`, `testing` o `production` |
| `NEXORA_DATABASE_URL` | `postgresql+psycopg://nexora:nexora@localhost:5434/nexora` | Conexion asincrona |
| `NEXORA_TEST_DATABASE_URL` | `postgresql+psycopg://nexora:nexora@localhost:5433/nexora_test` | Base de pruebas |
| `NEXORA_JWT_SECRET` | secreto de desarrollo | Obligatorio y de 32+ caracteres en produccion |
| `NEXORA_JWT_ALGORITHM` | `HS256` | Solo `HS256`, `HS384` o `HS512` |
| `NEXORA_JWT_ISSUER` | `nexora` | Claim `iss` |
| `NEXORA_JWT_AUDIENCE` | `nexora-app` | Claim `aud` |
| `NEXORA_ACCESS_TOKEN_TTL_MINUTES` | `10` | Vigencia del access token |
| `NEXORA_REFRESH_TOKEN_TTL_DAYS` | `7` | Vigencia del refresh token y de la sesion |
| `NEXORA_COOKIE_SAMESITE` | `lax` | `lax`, `strict` o `none` |
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
