# NEXORA — Base del frontend

Shell React basado en [TailAdmin React v2.5.0](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard/tree/v2.5.0).
Conserva su diseño, componentes y tema claro/oscuro. Licencia MIT original en `LICENSE.md`.
No contiene funcionalidades de negocio ni autenticación: `/signin` conserva la vista, con el envío deshabilitado hasta T2.

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
| `pnpm test` | Vitest en Node: únicamente HTTP y variables de entorno |

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
├── features/.gitkeep        # Futuras funcionalidades; vacío en T1
├── pages/
│   ├── home/                # BlankPage como marcador de Inicio
│   ├── error-404/
│   └── others/auth/         # AuthLayout y vista Sign In de TailAdmin
├── components/
│   ├── layout/app-layout/   # Sidebar y header de TailAdmin, sin demos
│   ├── shared/              # Metadatos, cuadrícula y selector de tema
│   └── ui/                  # Solo primitivas importadas por el shell/acceso
├── contexts/                # Tema claro/oscuro/automático de TailAdmin
├── hooks/                   # Breakpoint del sidebar
├── icons/                   # Solo iconos utilizados
└── utils/                   # cn y reglas Tailwind Merge
```

Rutas actuales: `/`, `/signin` y cualquier otra URL → 404. No hay registro público, recuperador de contraseña,
login social, perfiles, buscador ni notificaciones de demostración. La página de acceso no realiza peticiones.
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

`httpClient` es la instancia compartida configurada desde `env`. Para pruebas o futuros proveedores de sesión:

```ts
import { createHttpClient } from "@/lib/http/http-client";

const client = createHttpClient({
  baseUrl: "/api/v1",
  getAccessToken: () => undefined, // T2 suministrará el token en memoria
});
// Ejemplo de contrato; no añade pantallas ni endpoints:
await client.post<unknown>("/recurso", { body: { valor: 1 } });
```

Métodos `get/post/put/patch/delete<T>(path, options)`: `body` es un valor serializable a JSON;
`headers`, `signal` y el resto de opciones fetch se conservan. Se envían cookies con `credentials: 'include'`;
el token opcional se obtiene en cada llamada y se envía como Bearer. Una respuesta 204 devuelve `undefined`.
Los errores FastAPI conservan `status`, `detail` y `body` en `ApiError`; la lista 422 se presenta como
`body.campo: mensaje; body.otro: mensaje`. Respuesta no JSON: mensaje genérico y `body: null`.
Fallo de red: `status: 0`, mensaje genérico y `body: null`. No hay reintentos, refresh ni lógica de negocio.
`T` tipa el resultado; no sustituye validación de datos en tiempo de ejecución.

## Agregar un módulo en features/

1. Crear `src/features/<modulo>/` solo cuando exista una funcionalidad aprobada; colocar allí sus componentes,
   tipos y llamadas a la API. Reutilizar `components/ui`, `components/shared` y `httpClient`.
2. Crear el punto de entrada de la página en `pages/`, sin duplicar primitivas de TailAdmin.
3. Registrar su carga con `React.lazy` en `routes/index.tsx`. Añadir su enlace en `config/navigation.ts`
   únicamente si debe aparecer en el menú.
4. Mantener textos en español y variantes `dark:`. Ejecutar lint, test y build.

No introducir dependencias que el código conservado no importe. Esta base no modifica backend ni Docker.

## Exclusiones de herramientas

`node_modules/`, `dist/`, `.env*`, `coverage/` y `.tailadmin-src/` están ignorados por Git.
La copia temporal de TailAdmin no es código de la aplicación: también está excluida explícitamente de TypeScript,
ESLint, Oxlint, Prettier, Vitest y del escaneo de clases Tailwind. El orquestador la elimina tras la entrega.
