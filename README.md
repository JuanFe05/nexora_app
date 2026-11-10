# NEXORA

Plataforma empresarial modular para una IPS en Colombia. Monolito modular con Domain-Driven
Design y Clean Architecture dentro de cada modulo.

```
nexora_app/
  backend/     API en Python 3.14 + FastAPI + PostgreSQL (ver backend/README.md)
  frontend/    React + TypeScript + Vite + Tailwind sobre TailAdmin (ver frontend/README.md)
  docs/        documentacion funcional y tecnica por modulo
  odd/         seguimiento de trabajo (Organic Driven Development)
  docker-compose.yml
```

## Puesta en marcha con Docker

```bash
cp .env.development.template .env   # completar POSTGRES_PASSWORD y NEXORA_JWT_SECRET
docker compose up -d --build   # postgres -> migrate (alembic) -> api -> frontend
curl http://localhost:45335/health
```

- **Frontend:** <http://localhost:45334>. Nginx sirve la aplicacion y reenvia `/api` a la API en el
  mismo origen (sin CORS para esas llamadas).
- **API:** <http://localhost:45335>, con su OpenAPI en <http://localhost:45335/docs>.

Desarrollo del frontend con recarga en caliente (Vite, puerto 5173):

```bash
docker compose --profile dev up -d frontend-dev
```

Si cambias `FRONTEND_HOST_PORT`, agrega ese origen a `NEXORA_ALLOWED_ORIGINS` en `.env`: el backend
valida el `Origin` de las peticiones con cookie.

**La sesión se cierra a los ~10 minutos aunque trabajes.** Casi siempre es `NEXORA_ALLOWED_ORIGINS`:
`/auth/refresh` valida CSRF y el `Origin` exacto (esquema + host + puerto; `localhost` y `127.0.0.1` son
distintos). Si el origen desde el que abres el frontend no está en la lista, la renovación responde 401 al
vencer el access token y la app lo toma como sesión expirada. Comprueba, en este orden: (1) el origen real
en la barra del navegador está en `NEXORA_ALLOWED_ORIGINS` (desarrollo `http://localhost:5173`, Docker
`http://localhost:45334`); (2) reiniciaste/reconstruiste la API tras cambiar `.env`
(`docker compose up -d --build`); (3) la migración está aplicada (`alembic upgrade head`, la hace el servicio
`migrate`); (4) en DevTools > Network, la petición `POST /api/v1/auth/refresh` (estado y detalle) y las
cookies `nexora_refresh_token` / `nexora_csrf_token`. No se soluciona subiendo los TTL de los tokens.
El servicio `migrate` aplica las migraciones de Alembic y la API no arranca hasta que termina
correctamente.

Generar el secreto JWT:

```bash
docker run --rm python:3.14-slim python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Comandos frecuentes

| Comando | Para que |
| --- | --- |
| `docker compose up -d --build` | Levanta PostgreSQL, migra y arranca la API |
| `docker compose logs -f api` | Sigue los logs de la API |
| `docker compose run --rm migrate` | Aplica migraciones pendientes sin reiniciar la API |
| `docker compose --profile test up -d postgres-test` | Base efimera para las pruebas de integracion |
| `docker compose --profile dev up -d frontend-dev` | Frontend con Vite y recarga en caliente |
| `docker compose down` | Detiene los servicios y conserva el volumen de datos |
| `docker compose ps` | Estado y salud de cada servicio |

`docker compose down -v` borra el volumen `nexora-postgres-data` con todos los datos: usarlo solo
a proposito.

## Desarrollo del backend sin contenedor

El flujo de desarrollo local vive en [`backend/README.md`](backend/README.md): PostgreSQL en
Docker y la API local con `uv run python main.py` (sin recarga automatica: reinicia la API tras cambiar codigo).

## Configuracion

Dos plantillas versionadas, sin secretos: `.env.development.template` (desarrollo local, se copia a
`.env`) y `.env.production.template` (produccion, se copia a `.env.production` en el servidor y se usa con
`docker compose --env-file .env.production up -d --build`). `.env` y `.env.production` nunca se versionan.
Las variables se cargan con Pydantic Settings y se documentan en
[`backend/README.md`](backend/README.md). `.env` nunca se versiona.

## Documentacion

- [`docs/modules/identity_access/`](docs/modules/identity_access/README.md): modulo de identidad
  y acceso (IAM).
