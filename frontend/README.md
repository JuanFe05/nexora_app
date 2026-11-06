# NEXORA — Base del frontend

Shell React basado en [TailAdmin React v2.5.0](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard/tree/v2.5.0).
Conserva su diseño, componentes y tema claro/oscuro. Licencia MIT original en `LICENSE.md`.
Incluye autenticación conectada a la API de NEXORA: acceso, restauración de sesión y cierre de sesión.
No contiene funcionalidades de negocio, registro público ni pantallas de administración.

## Inicio rápido

Requisitos: **Node >=24 <25** y **PNPM 12.18.0** (fijado en `packageManager`).

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Abre <http://localhost:5173>. Si los shims de Corepack están habilitados, puedes usar `pnpm` directamente.
No hace falta instalar nada globalmente; como alternativa, usa `npx pnpm@12.18.0 <comando>`.

## Stack y scripts

React 19 · TypeScript 6 · Vite 8 · Tailwind CSS 4 · React Router 8 · Base UI.
Versiones directas exactas en `package.json`, resoluciones transitivas en `pnpm-lock.yaml` y `save-exact=true` en `.npmrc`.
Las versiones conservadas se tomaron de las resoluciones del `package-lock.json` de la plantilla, no de sus rangos.

| Comando | Resultado |
| --- | --- |
| `pnpm dev` | Vite en `0.0.0.0:5173`; falla si el puerto está ocupado |
| `pnpm build` | `tsc -b && vite build`; genera `dist/` |
| `pnpm preview` | Sirve la compilación, con el mismo proxy de API |
| `pnpm lint` | Oxlint con análisis de tipos y ESLint, configuraciones de TailAdmin |
| `pnpm format` | Prettier con ordenación de clases Tailwind |
| `pnpm test` | Vitest: HTTP, autenticación y variables en Node; componentes e interacciones en jsdom, sin backend real |

## Estructura

```text
src/
├── main.tsx                 # Entrada y estilos
├── App.tsx                  # Providers y montaje de rutas
├── routes/index.tsx         # Único registro; páginas con React.lazy
├── config/
│   ├── env.ts               # Variables públicas, valores por defecto y validación
│   └── navigation.ts        # Menú: solo Inicio → /
├── lib/http/                # Cliente fetch y ApiError
├── features/auth/
│   ├── api/auth-api.ts      # Login, refresh, logout y me mediante httpClient
│   ├── session/             # Token en memoria, controlador y conexión HTTP
│   ├── components/          # Formulario TailAdmin, guards y menú de usuario
│   ├── auth-provider.tsx    # Restauración y suscripción al estado
│   ├── auth-context.ts      # Contrato público del contexto
│   ├── use-auth.ts          # Acceso al contexto desde componentes
│   ├── error-message.ts     # Mensajes de error seguros en español
│   └── types.ts             # Contratos de autenticación
├── pages/
│   ├── home/                # BlankPage como marcador de Inicio
│   ├── error-404/
│   └── others/auth/         # AuthLayout y vista Sign In de TailAdmin
├── components/
│   ├── layout/app-layout/   # Sidebar y header de TailAdmin, sin demos
│   ├── shared/              # Metadatos, cuadrícula del 404 y selector de tema
│   └── ui/                  # Solo primitivas importadas por el shell/acceso
├── contexts/                # Tema claro/oscuro/automático de TailAdmin
├── hooks/                   # Breakpoint del sidebar
├── icons/                   # Solo iconos utilizados
└── utils/                   # cn y reglas Tailwind Merge
```

Rutas actuales: `/` y `/cuenta` con su layout requieren sesión; `/signin` solo admite visitantes anónimos;
`/cuenta` reutiliza el marcador de Inicio con el título «Configuración de la cuenta», sin funcionalidad de negocio ni enlace en el sidebar;
cualquier otra URL → 404. El guard conserva la ruta, consulta y fragmento solicitados para volver después del acceso.
Una visita autenticada directa a `/signin` vuelve a `/`. No hay registro público, recuperador de contraseña,
«mantener la sesión iniciada», login social, perfiles, buscador ni notificaciones de demostración.
Textos en español, sin i18n. Se usó `es.json` de TailAdmin donde hay traducción; la vista de acceso original
contiene texto inglés sin claves equivalentes, traducido directamente aquí.

## Variables públicas

El código de aplicación solo lee variables mediante `src/config/env.ts`. Ninguna variable `VITE_*` es secreta:
Vite la puede incluir en el navegador. No guardar tokens, contraseñas ni claves privadas en archivos de entorno.

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Debe empezar por `/`, `http://` o `https://`; un valor inválido lanza un error claro al arrancar |
| `VITE_APP_NAME` | `NEXORA` | Nombre en cabecera, acceso y títulos |
| `VITE_DEV_PROXY_TARGET` | `http://localhost:45335` | Solo configuración de Vite: `process.env`, destino de `/api` en dev y preview; no se lee desde la aplicación |

Para cambiar el proxy, exportar `VITE_DEV_PROXY_TARGET` en el proceso que inicia Vite. Mantener el mismo origen
con `/api/v1` evita configurar CORS en esta base. El proxy no implementa endpoints.

## Cliente HTTP

`httpClient` es la instancia compartida configurada desde `env`. La integración de auth configura sus callbacks
mediante `configureAuth`, sin acoplar la librería HTTP a React. Para pruebas o clientes independientes:

```ts
import { createHttpClient } from "@/lib/http/http-client";

const client = createHttpClient({
  baseUrl: "/api/v1",
  getAccessToken: () => undefined, // La instancia de aplicación lee el almacén en memoria
});
// Ejemplo de contrato; no añade pantallas ni endpoints:
await client.post<unknown>("/recurso", { body: { valor: 1 } });
```

Métodos `get/post/put/patch/delete<T>(path, options)`: `body` es un valor serializable a JSON;
`headers`, `signal` y el resto de opciones fetch se conservan. Se envían cookies con `credentials: 'include'`;
el token opcional se obtiene en cada llamada y se envía como Bearer. Una respuesta 204 devuelve `undefined`.
Los errores FastAPI conservan `status`, `detail` y `body` en `ApiError`; la lista 422 se presenta como
`body.campo: mensaje; body.otro: mensaje`. Respuesta no JSON: mensaje genérico y `body: null`.
Fallo de red: `status: 0`, mensaje genérico y `body: null`. `ApiError.retryAfter` conserva la cabecera `Retry-After`,
incluso si la respuesta no es JSON. Ante un 401 fuera de `/auth/*`, la instancia compartida intenta un refresh y
repite la petición una sola vez, conservando cuerpo, cabeceras y señal. Nunca reintenta los endpoints de auth ni
otros errores. Cada reintento obtiene el token vigente. Si falla el refresh o la carga de `/auth/me`, la sesión
pasa a anónima y se descarta el token. `T` tipa el resultado; no sustituye validación de datos en tiempo de ejecución.

## Autenticación y modelo de sesión

- El formulario envía `identificador` (usuario o correo) y `contrasena` a `POST /auth/login`, y consulta
  `GET /auth/me` para obtener usuario, roles y permisos. Deshabilita sus controles mientras espera; no guarda
  la contraseña en el estado de React y la vacía tras un error.
- El access token vive **solo en memoria**. No se escribe en localStorage, sessionStorage ni cookies desde JS.
  El refresh token lo gestiona el backend en una cookie HttpOnly: el frontend nunca lo lee.
- Al montar `AuthProvider` se intenta **un único refresh** para restaurar la sesión. Las llamadas concurrentes
  comparten la misma promesa (también durante el montaje doble de desarrollo de React StrictMode).
  Una recarga pierde el access token y vuelve a intentar la restauración por cookie.
- Refresh y logout leen el valor actual de `nexora_csrf_token` desde `document.cookie` y lo envían en
  `X-CSRF-Token`, sin cuerpo. El navegador añade `Origin`; no se fabrica esa cabecera. La cookie CSRF debe
  ser legible en las rutas del frontend (`Path=/`, según la implementación actual del backend).
- Se mantiene el mismo origen a través de los proxies de desarrollo y producción; no usar otro origen para
  la API de sesión sin revisar cookies, CSRF y la configuración del backend.
- `useAuth()` expone `status` (`loading`, `authenticated`, `anonymous`), `user`, `roles`, `permissions`,
  `login`, `logout` y `hasPermission`. Mientras se restaura la sesión, los guards muestran un estado de carga.
  `hasPermission` facilita presentación; **la autorización real siempre corresponde al backend**.
- El menú de usuario de la cabecera no utiliza avatar, fotografía ni iniciales: muestra `nombre_completo`, `correo`,
  «Configuración de la cuenta» y «Cerrar sesión». Se abre por clic o teclado; las flechas recorren opciones,
  Escape lo cierra y devuelve el foco, y un clic exterior lo cierra. No incluye perfil, soporte ni idioma.
  Logout limpia token, usuario, roles y permisos
  inmediatamente, incluso si falla el servidor. Un refresh que termine después no puede restaurar ese estado.
  Si la petición de logout no llega al backend, la cookie HttpOnly puede seguir siendo válida hasta su vencimiento:
  una recarga podría restaurar esa sesión; JavaScript no puede revocarla localmente.
- Errores de acceso: 401 → «Credenciales invalidas», sin revelar el campo incorrecto; 429 →
  «Demasiados intentos. Intenta de nuevo en N segundos.» usando `Retry-After` numérico; si falta o es inválido,
  se pide reintentar más tarde. 422 y fallos de red muestran mensajes breves sin detalles internos.

### Pruebas

`corepack pnpm test` ejecuta pruebas deterministas con fetch simulado, sin solicitudes al backend.
Las pruebas de autenticación están junto a las del cliente en `src/lib/http/http-client.test.ts`, uno de los
puntos de entrada permitidos por la configuración Vitest del shell. Cubren contratos y CSRF, token en memoria,
restauración única y single-flight, recuperación 401 con un solo reintento, fallo a anónimo, logout y mensajes
401/429/422/red. Las pruebas de componentes usan Testing Library y `// @vitest-environment jsdom` por archivo;
las demás siguen en Node. Se simula `useAuth` en su límite público, no HTTP, para comprobar validación,
foco, errores, visibilidad de contraseña y menú. El botón de tema conserva el contorno y las esquinas de TailAdmin,
sin forma circular: luna para activar oscuro y sol para activar claro. Usa el `ThemeProvider` real,
expone `aria-pressed` y persiste la preferencia con el sistema de temas de TailAdmin.

Ejecutar toda la batería: `corepack pnpm test`. Solo componentes: `corepack pnpm exec vitest run src/features/auth/components src/components/shared/header/theme-toggler`.
El formulario valida campos obligatorios al enviar, muestra mensajes debajo de cada campo y conserva usuario o correo
como identificador. Los errores de autenticación señalan ambos campos sin revelar cuál falló.
La apariencia responsive y el acceso real requieren además comprobación en navegador, sin registrar credenciales ni tokens.

## Diseño del acceso

El formulario conserva la columna `max-w-md` y los inputs estándar de TailAdmin (`h-11`), con mensajes y
estados de validación accesibles. En escritorio se muestra un panel fotográfico; por debajo de `lg`, la marca
NEXORA y «Gestión inteligente para una atención conectada» aparecen encima del formulario. Ambos temas
conservan el selector fijo de TailAdmin desde `sm`.

La fotografía se sirve localmente desde `public/images/auth/sign-in-bg.jpg` (1600 × 1067), sin solicitudes
externas. Fuente: [Pexels — mano y tableta digital](https://www.pexels.com/es-es/foto/mano-tecnologia-tableta-digital-pantalla-tactil-12326656/).
Se utiliza bajo la [licencia Pexels](https://www.pexels.com/license/), gratuita y sin atribución obligatoria.
La imagen es decorativa (`alt` vacío) y lleva un degradado `brand-950` (`#161950`) del 90 % al 65 %,
con 85 % en el centro; en oscuro, del 95 % al 75 %, con 90 % en el centro.
Incluso sobre un píxel blanco, la opacidad mínima del 65 % produce aproximadamente `#686a8d`:
el contraste del texto blanco es al menos 5,2:1 (en oscuro, al menos 7,3:1 con 75 %).
Estos límites conservadores superan WCAG AA 4,5:1 sin depender de la posición o del recorte de la fotografía;
la sombra del texto es solo un refuerzo, no parte del cálculo.

## Agregar un módulo en features/

1. Crear `src/features/<modulo>/` solo cuando exista una funcionalidad aprobada; colocar allí sus componentes,
   tipos y llamadas a la API. Reutilizar `components/ui`, `components/shared` y `httpClient`.
2. Crear el punto de entrada de la página en `pages/`, sin duplicar primitivas de TailAdmin.
3. Registrar su carga con `React.lazy` en `routes/index.tsx`. Añadir su enlace en `config/navigation.ts`
   únicamente si debe aparecer en el menú, incluyendo su componente `icon` tipado. El sidebar lo muestra
   también al contraerse, con los estilos activo/inactivo de TailAdmin.
4. Mantener textos en español y variantes `dark:`. Ejecutar lint, test y build.

No introducir dependencias que el código conservado no importe. Esta base no modifica backend ni Docker.

## Exclusiones de herramientas

`node_modules/`, `dist/`, `.env*`, `coverage/` y `.tailadmin-src/` están ignorados por Git.
La copia temporal de TailAdmin no es código de la aplicación: también está excluida explícitamente de TypeScript,
ESLint, Oxlint, Prettier, Vitest y del escaneo de clases Tailwind. El orquestador la elimina tras la entrega.

## Docker

El `Dockerfile` tiene cuatro etapas: `deps` (pnpm con lockfile congelado), `dev` (Vite con recarga),
`build` (compila con las `VITE_*`) y `runtime` (Nginx sin privilegios, usuario 101, puerto 8080).
Las imagenes base estan fijadas (`node:24.13.0-alpine3.23`, `nginx-unprivileged:1.28.1-alpine3.23`)
y pnpm lo fija `packageManager` en `package.json`.

Desde la raiz del repositorio:

```bash
docker compose up -d --build                       # produccion: http://localhost:45334
docker compose --profile dev up -d frontend-dev    # desarrollo: http://localhost:5173
```

- **Produccion:** `nginx.conf.template` sirve los estaticos (con fallback de SPA y cache inmutable
  para `/assets/`) y hace proxy de `/api/` al servicio `api` (`API_UPSTREAM`).
- **Desarrollo:** el codigo de `src/` se monta como volumen y Vite reenvia `/api` a la API
  (`VITE_DEV_PROXY_TARGET`).
- **Variables:** solo `VITE_*` (`VITE_API_BASE_URL`, `VITE_APP_NAME`), publicas y embebidas en el
  bundle. Los secretos del backend nunca llegan al frontend.
