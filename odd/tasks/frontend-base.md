# Feature: frontend-base — Base del frontend React + TailAdmin

Frontend de NEXORA en `frontend/` con React + TypeScript + Vite + Tailwind CSS sobre la plantilla
oficial TailAdmin React (MIT, v2.5.0), PNPM, dockerizado dentro del compose existente.
Rama: `feature/develop`. Estado: en implementacion.

## Specs

- **S1** "Utilizar la plantilla oficial de TailAdmin React como punto de partida, respetando su
  diseno, componentes y sistema visual." "No duplicar componentes que TailAdmin ya proporciona."
- **S2** "Utilizar PNPM para la gestion de dependencias." "No utilizar versiones `latest`."
  "No introducir librerias innecesarias."
- **S3** "Aplicar buenas practicas de React, TypeScript, SOLID y separacion de responsabilidades."
  "Organizar el frontend por funcionalidades o modulos, evitando componentes demasiado grandes y
  codigo duplicado."
- **S4** "Preparar la navegacion, layouts, componentes compartidos, configuracion de rutas y cliente
  HTTP para comunicarse con FastAPI." "Mantener el frontend desacoplado del backend,
  comunicandose mediante su API REST."
- **S5** "Centralizar las variables de entorno del frontend, sin exponer secretos."
- **S6** "Dockerizar el frontend e integrarlo con el Docker Compose existente, sin afectar los
  servicios de FastAPI y PostgreSQL." "Preparar los entornos de desarrollo y produccion,
  utilizando imagenes optimizadas y versiones controladas."
- **S7** "No modificar la arquitectura ni la logica del backend." "No inventar pantallas o modulos
  que no hayan sido definidos." "No implementar funcionalidades de negocio todavia."
- **S8** Decision del usuario (L2): Sign In de TailAdmin conectado al backend; sin Sign Up (el
  backend no tiene registro publico); sin i18n, texto en espanol; Vitest solo para el cliente
  HTTP y la validacion de variables.

## Decisiones de diseno (propuestas por el agente y aprobadas con L2)

- D1 Mismo origen: el frontend llama a `/api/v1`; Vite (dev) y Nginx (prod) hacen proxy al
  servicio `api`. Sin CORS ni problemas de SameSite con la cookie de refresh.
- D2 Token de acceso solo en memoria; el refresh vive en cookie HttpOnly del backend.
- D3 Carpetas de TailAdmin intactas (`components/ui`, `components/layout`, `icons`, ...) mas
  `config/`, `lib/http/`, `routes/`, `features/` (auth) y `pages/`.
- D4 Compose: `frontend` (Nginx sin root, puerto `FRONTEND_HOST_PORT`, 45334) y `frontend-dev`
  (profile `dev`, Vite con recarga). postgres, migrate y api no cambian.

## Tasks

| ID | Specs | Ruta | Commit | Estado |
| --- | --- | --- | --- | --- |
| T1 Armazon TailAdmin podado, PNPM, config, env, cliente HTTP, Vitest | S1-S5, S7 | worker | `969b984` | hecho |
| T2 Feature auth: Sign In conectado, sesion en memoria, guard, logout | S3, S4, S7, S8 | worker | ver commit feat(frontend) auth | hecho |
| T3 Docker (dev y prod), compose, .env.template y documentacion | S5, S6 | inline | ver commit feat(frontend) docker | hecho |
| T4 Verificacion integrada con backend y PostgreSQL | S1-S8 | inline | mismo commit que T3 | hecho (parcial) |

## Log

- **L1** Solicitud original del usuario: "NEXORA — Configuracion del frontend con React y
  TailAdmin. Implementa la base del frontend de NEXORA utilizando React + TypeScript + Vite +
  Tailwind CSS, tomando como referencia la plantilla oficial de TailAdmin
  (https://tailadmin.com/docs/installation/react)." Requisitos: plantilla oficial, PNPM, buenas
  practicas y SOLID, organizacion por funcionalidades, navegacion/layouts/componentes
  compartidos/rutas/cliente HTTP hacia FastAPI, variables de entorno centralizadas sin secretos,
  dockerizar e integrar con el Compose existente sin afectar FastAPI y PostgreSQL, entornos de
  desarrollo y produccion con imagenes optimizadas y versiones controladas. Restricciones: no
  modificar el backend, no implementar negocio, no inventar pantallas, no duplicar componentes de
  TailAdmin, no librerias innecesarias, no `latest`, frontend desacoplado. Metodologia: "Trabaja
  siguiendo ODD. Primero inspecciona ... Presenta brevemente la estructura propuesta y los
  archivos que modificaras. Despues de aprobar el diseno, implementa, dockeriza y verifica que el
  frontend funcione correctamente junto con los servicios existentes."
- **L2** Respuestas del usuario al diseno: Sign In -> "Sign In conectado al backend"; i18n ->
  "Quitar i18n, texto en espanol"; pruebas -> "Si, solo Vitest".
- **L3** Exploracion: TailAdmin free-react-tailwind-admin-dashboard v2.5.0, MIT, 563 archivos
  (~190 paginas de demostracion), `package-lock.json` de npm, Vite 8, React 19, TS ~6, Tailwind 4,
  React Router 8. Entorno local: Node 24, Corepack 0.34, sin pnpm instalado.
- **L4** Verificacion integrada (stack completo con `docker compose up`): frontend sano en 45334 con
  usuario 101; `/`, `/signin` y rutas desconocidas devuelven el SPA, `/assets/inexistente` 404;
  `/api/v1/auth/me` sin token 401 a traves del proxy; login real 200 con cookie de refresh
  HttpOnly; `/me` con rol ADMINISTRADOR y 16 permisos; `/users` 200; refresh sin CSRF 401, con CSRF
  200, reuso del token anterior 401 y origen ajeno 401; perfil `dev` sirve Vite en 5173 con proxy.
  Frontend: 56 pruebas, lint sin errores, build correcto. Backend sin cambios (`git diff -- backend`
  vacio). NO verificado: render visual en navegador, flujo interactivo del formulario y recarga en
  caliente. Pendiente del usuario: agregar `http://localhost:45334` a `NEXORA_ALLOWED_ORIGINS` en su
  `.env` local (la plantilla ya lo trae).
