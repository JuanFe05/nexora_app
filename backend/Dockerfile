# syntax=docker/dockerfile:1.7
# Imagen del backend de NEXORA: dependencias reproducibles con uv y ejecucion sin privilegios.

FROM python:3.14-slim-bookworm AS builder

# uv se copia desde su imagen oficial: la version queda fijada igual que en desarrollo.
COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Primero solo el manifiesto y el lock: esta capa se reaprovecha mientras no cambien.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    uv sync --locked --no-install-project --no-dev

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev


FROM python:3.14-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# Usuario sin privilegios: el contenedor nunca corre como root.
RUN groupadd --system nexora && useradd --system --gid nexora --home-dir /app nexora

WORKDIR /app
COPY --from=builder --chown=nexora:nexora /app /app

USER nexora
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"]

# La configuracion llega por variables de entorno (prefijo NEXORA_), nunca horneada en la imagen.
CMD ["uvicorn", "nexora.bootstrap.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
