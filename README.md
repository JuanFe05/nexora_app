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
cp .env.template .env          # completar POSTGRES_PASSWORD y NEXORA_JWT_SECRET
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

El flujo con recarga en caliente vive en [`backend/README.md`](backend/README.md): PostgreSQL en
Docker y la API local con `uv run python main.py`.

## Configuracion

Todas las variables estan en `.env.template`, se cargan con Pydantic Settings y se documentan en
[`backend/README.md`](backend/README.md). `.env` nunca se versiona.

## Documentacion

- [`docs/modules/identity_access/`](docs/modules/identity_access/README.md): modulo de identidad
  y acceso (IAM).
