# syntax=docker/dockerfile:1.7
# Imagen del frontend de NEXORA. Etapas: deps -> dev (Vite con recarga) | build -> runtime (Nginx).
# Versiones de las imagenes base fijadas; pnpm lo fija `packageManager` en package.json (Corepack).

ARG NODE_IMAGE=node:24.13.0-alpine3.23
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28.1-alpine3.23


FROM ${NODE_IMAGE} AS deps

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true

RUN corepack enable
WORKDIR /app

# Solo el manifiesto y el lock: esta capa se reaprovecha mientras no cambien las dependencias.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=nexora-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile


# Desarrollo: servidor de Vite con recarga en caliente (el codigo se monta como volumen).
FROM deps AS dev

COPY . .
EXPOSE 5173
CMD ["pnpm", "dev"]


# Compilacion de produccion. Las VITE_* se incorporan al bundle: nunca pasar secretos.
FROM deps AS build

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_NAME=NEXORA
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_APP_NAME=${VITE_APP_NAME}

COPY . .
RUN pnpm build


# Produccion: solo archivos estaticos servidos por Nginx sin privilegios (usuario 101).
FROM ${NGINX_IMAGE} AS runtime

# La plantilla se procesa al arrancar: sustituye solo API_UPSTREAM y conserva las $variables de nginx.
ENV API_UPSTREAM=http://api:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]
