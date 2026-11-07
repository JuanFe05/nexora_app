# Sesión de autenticación

El access token vive exclusivamente en memoria. El backend administra las cookies de refresh y CSRF, la rotación y los límites de inactividad/duración absoluta; el frontend no almacena ni registra tokens.

## Renovación y recuperación

| Situación | Comportamiento |
| --- | --- |
| Access token próximo a vencer | Usa `expires_in` (segundos) de login/refresh para renovar 30 segundos antes, únicamente con actividad. Si falta o no es un número finito no negativo, intenta leer `exp` del payload JWT base64url defensivamente, sin verificarlo ni usarlo para autorizar. Si tampoco es válido, programa una renovación a los 8 minutos con actividad (horizonte local estimado de 8 min 30 s). Es solo planificación: no modifica la vigencia real del token ni los límites del backend. |
| Actividad válida | `pointerdown`, `keydown`, `wheel`, `scroll`, `touchstart` con listeners pasivos y throttle de 1 segundo, o una petición API ajena a autenticación. Las peticiones internas `/auth/me` y `/auth/refresh` no cuentan como actividad. |
| Sin actividad | No renueva. Focus/visibility por sí solos tampoco recuperan un token vencido; la expiración por inactividad la determina el backend. |
| Focus/visibility con actividad | Si el token está vencido o a menos de 30 segundos de vencer, renueva dentro del mismo single-flight. Conserva la recarga anterior del principal en pestañas visibles cuando el token aún no está próximo a vencer. |
| 401 en una petición de negocio | Una única renovación compartida por pestaña y un único reintento de la petición con el bearer actualizado. Nunca reintenta una operación prohibida (403). |
| Refresh 401/403 o `/auth/me` posterior 401 | Borra token y principal, difunde el cierre local y deja que el guard redirija a `/signin`. Un componente global bajo ToastProvider consume la señal React-free y muestra «Tu sesión expiró». |
| Red, timeout, 5xx u otros errores de renovación | Dos reintentos tras 250 y 500 ms, dentro del single-flight. Cada refresh HTTP tiene timeout de 10 segundos. Si falla, conserva el estado actual y devuelve un `ApiError(0)` seguro, sin redirigir al login. Rearma recuperación a los 15, 30 y 60 segundos (tope de 60), conservando la actividad pendiente; no inicia reintentos programados cuando vence el access token o el horizonte local estimado. Una recuperación exitosa reinicia el backoff y consume la actividad anterior; eventos durante la petición cuentan para el siguiente ciclo. Otra petición de negocio puede solicitar recuperación. Un fallo temporal de `/auth/me` reintenta solo esa lectura, sin rotar otra vez. |

La renovación y los fallos temporales nunca publican `loading` ni `anonymous` sobre una sesión autenticada: los guards conservan la ruta y los formularios montados. El reintento de un POST tras 401 mantiene el mismo cuerpo JSON y se hace una sola vez.

### Diagnóstico en desarrollo

Solo con `import.meta.env.DEV`, cada renovación que falla finalmente emite un único aviso:

```text
[auth] refresh failed: status=<n|network> classification=<terminal|transient> cause=<causa>
```

Las causas son categorías fijas: `se perdió la cookie CSRF`, `origen no permitido`, `sesión inválida/expirada` o `red`. Se deducen del estado HTTP, la presencia booleana de CSRF y mensajes cortos reconocidos; nunca se imprime el detalle original, tokens ni valores de cookies. Un error genérico del backend no permite distinguir todos los rechazos de origen/CSRF. En producción no hay avisos. Cancelación por logout/desmontaje tampoco genera diagnósticos.

## Pestañas y cierre

- Web Locks serializa la renovación con `nexora-auth-refresh` cuando está disponible. Sin esa API conserva el single-flight por pestaña; la gracia de rotación del backend protege la concurrencia entre pestañas.
- BroadcastChannel (`nexora-auth-session`) transmite solo `{ type: "logout" }`, nunca tokens. El receptor limpia su estado sin hacer eco ni otra llamada de logout. Ambas APIs admiten fakes inyectados para pruebas.
- `logout` conserva su comportamiento: cierre local inmediato, incluso si el servidor no responde.
- `logoutAll` llama `POST /api/v1/auth/logout-all` sin cuerpo, con bearer, cookies incluidas y el mismo encabezado CSRF de logout. Solo un 204 exitoso limpia la sesión y difunde el cierre; un fallo conserva el acceso y se muestra como error en el perfil.
- AuthProvider monta los listeners y el temporizador. Logout y desmontaje los retiran, cierran el canal y cancelan esperas pendientes de backoff. Un login posterior vuelve a montar los recursos si el proveedor continúa activo.

## Si la sesión se cierra

En DevTools, sin copiar ni compartir valores de tokens/cookies:

- [ ] Revisar la petición `/auth/refresh`: estado HTTP y `detail` de respuesta; 401/403 son definitivos, red/5xx no deben redirigir.
- [ ] Comprobar presencia y atributos de `nexora_csrf_token` y `nexora_refresh_token`: dominio, path, SameSite, Secure y expiración; CSRF debe ser legible desde la ruta actual y refresh es HttpOnly.
- [ ] Comparar el `Origin` de la petición con `NEXORA_ALLOWED_ORIGINS` del backend (incluidos esquema y puerto).
- [ ] No mezclar `localhost` con `127.0.0.1`: son hosts distintos para cookies y origen.
- [ ] Confirmar que se aplicó `alembic upgrade head` (migración `0002`) y que el backend se reinició después de cambiar configuración/migraciones.

## Verificación

Desde `frontend/`: `npx vitest run`, `npx tsc -b`, `npm run lint`. Las pruebas cubren errores definitivos/transitorios, backoff con reloj falso, actividad, focus, single-flight, Web Locks/fallback, BroadcastChannel, cancelación y expiración con toast y guard. La integración real entre pestañas, las cookies y la presentación visual requieren verificación en navegador contra el backend.
