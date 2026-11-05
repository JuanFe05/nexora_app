# NEXORA

Plataforma empresarial modular para una IPS en Colombia. Monolito modular con Domain-Driven
Design y Clean Architecture dentro de cada modulo.

```
nexora_app/
  backend/     API en Python 3.14 + FastAPI + PostgreSQL (ver backend/README.md)
  frontend/    pendiente de definir
  docs/        documentacion funcional y tecnica por modulo
  odd/         seguimiento de trabajo (Organic Driven Development)
  docker-compose.yml
```

## Puesta en marcha con Docker

```bash
cp .env.template .env          # completar POSTGRES_PASSWORD y NEXORA_JWT_SECRET
docker compose up -d --build   # postgres -> migrate (alembic) -> api
curl http://localhost:8000/health
```

La API queda en <http://localhost:8000> y su OpenAPI en <http://localhost:8000/docs>.
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
