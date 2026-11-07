# Seguridad

## Controles aplicados

| Control | Implementacion |
| --- | --- |
| Hash de contrasenas | Argon2id (`argon2-cffi`), parametros por defecto de la libreria |
| Respuesta uniforme | Un unico `401 "Credenciales invalidas"` y verificacion de hash senuelo |
| Validacion de JWT | Algoritmo tomado de la configuracion (nunca del encabezado), firma, `iss`, `aud`, `exp`, `iat`, `sub`, `jti` requeridos y `token_type` esperado |
| Cookies | `HttpOnly`, `Secure` en produccion, `SameSite` configurable, `Path=/api/v1/auth` |
| CSRF | Double submit: cookie legible en `/` (`NEXORA_CSRF_COOKIE_PATH`) + cabecera `X-CSRF-Token`, comparadas con `secrets.compare_digest`, mas validacion de `Origin` |
| Revocacion inmediata | Cada request protegido verifica la sesion por `sid` y recarga roles y permisos efectivos en base de datos; roles inactivos no conceden acceso |
| Administracion IAM | Permiso `identity.*` independiente por accion; 403 generico antes de consultar el recurso si falta el permiso (incluso IDs inexistentes) |
| Anti-escalada | La aplicacion impide delegar permisos no poseidos; solo el rol `ADMINISTRADOR` puede asignar/revocar ese rol o editar/desactivar/eliminar administradores |
| Rotacion y reuso | UPDATE atomico por JTI vigente o anterior en gracia (30 s); JTI mas antiguo o anterior fuera de gracia revoca la sesion |
| Duracion de sesion | Inactividad deslizante de 30 min y tope absoluto de 12 h; al alcanzarlos se revoca y confirma antes del 401 |
| Actividad | Requests validos actualizan cada >= 60 s; refresh valido siempre actualiza, sin extender el absoluto |
| Cierre global | `POST /auth/logout-all` usa Bearer, revoca todas las sesiones propias en una transaccion y borra cookies |
| Fuerza bruta | Bloqueo temporal por IP + identificador |
| Secretos | `NEXORA_JWT_SECRET` por entorno; en produccion se exige 32+ caracteres y se rechaza el secreto de desarrollo |
| Minimizacion | Las respuestas nunca incluyen `hash_contrasena`, `refresh_token_jti` ni el JWT de refresh |
| Logs | No se registran contrasenas, hashes, JWT, cookies ni secretos |

Los permisos se resuelven desde roles en cada peticion, no desde el JWT: un cambio de asignacion
surte efecto con el mismo token en la peticion siguiente. Tener todos los permisos no equivale
a tener el rol `ADMINISTRADOR` para los limites anti-escalada. Una denegacion no altera datos
administrativos; la autenticacion conserva su registro de actividad de sesion. Mapa completo,
independencia de acciones y excepciones de delegacion en [administracion.md](administracion.md#autorizacion).

## Configuracion de sesiones

| Variable (`NEXORA_`) | Default | Limites admitidos |
| --- | --- | --- |
| `SESSION_IDLE_TIMEOUT_MINUTES` | 30 | 1-1440 minutos, no mayor que el absoluto |
| `SESSION_ABSOLUTE_TIMEOUT_HOURS` | 12 | 1-168 horas |
| `REFRESH_ROTATION_GRACE_SECONDS` | 30 | 1-300 segundos |
| `SESSION_ACTIVITY_TOUCH_SECONDS` | 60 | 1-300 segundos |
| `SESSION_WARNING_SECONDS` | 120 | 10-600 segundos, estrictamente menor que la inactividad |

Restricciones de consistencia validadas al arrancar: la inactividad debe ser mayor que la vigencia
del access token (el front renueva y registra actividad cerca de su vencimiento) y al menos el doble
de `SESSION_ACTIVITY_TOUCH_SECONDS` (la actividad se escribe con ese retraso maximo), para que un
usuario activo nunca venza por una configuracion incompatible.

Access conserva 10 min; refresh conserva 7 dias como techo, con `exp` limitado por
`fecha_vencimiento`. Firma, tipo y claims se validan siempre. Solo el caso de uso refresh
admite decodificar un JWT firmado vencido para persistir la revocacion; no lo acepta para
renovar. Un access vencido sigue respondiendo 401 sin revocar una sesion todavia activa,
que puede renovarse por refresh. Las filas anteriores a 0002 conservan su vencimiento;
ver [migracion](modelo-datos.md#migracion-0002).

## Politica de contrasenas

La validacion definitiva se realiza en el backend al crear usuarios, cambiar contrasenas y
configurar el administrador inicial (bootstrap). Una sola fuente de dominio,
`domain/value_objects/password_policy.py`, devuelve las reglas incumplidas en este orden:

| Regla | Definicion |
| --- | --- |
| Longitud | 6-24 code points Unicode, sin recortar ni normalizar |
| Mayuscula | Al menos un caracter de categoria Unicode `Lu` |
| Minuscula | Al menos un caracter de categoria Unicode `Ll` |
| Numero | Al menos un caracter de categoria Unicode `Nd` |
| Especial | Al menos un caracter de categoria `P*` (puntuacion) o `S*` (simbolo); `@ # $ % & !` cumplen |

Los espacios cuentan para la longitud, pero no son especiales. Un caracter no BMP cuenta como
un code point. El mensaje ASCII compartido nombra solo las reglas incumplidas, nunca la clave.
HTTP responde 422 sin `input` ni `ctx`. Argon2id y el almacenamiento seguro permanecen iguales.

Login y la contrasena **actual** de `POST /api/v1/profile/password` conservan 1-128 caracteres:
no se les exige esta politica, para que claves legacy sigan permitiendo acceso y cambio.
La contrasena **nueva** ademas debe ser diferente de la actual.

No existe endpoint ni UI de restablecimiento administrativo y no se construye en este cambio.
Cuando se implemente debe reutilizar el mismo modulo, no copiar las reglas. Si el usuario olvida
su clave, el procedimiento supervisado por el administrador queda fuera de alcance: el usuario
debe ingresar personalmente la nueva clave y el administrador nunca debe conocerla ni
establecerla. No existe recuperacion automatica por correo.

## Autoservicio del perfil

[Perfil propio](perfil.md) esta disponible para cualquier usuario autenticado, sin exigir rol.
Su lista cerrada de campos excluye `nombre_usuario` (solo lectura), estado, roles e ID.
La contrasena actual se verifica con Argon2; un fallo responde `400`, no `401`, para evitar
refresh involuntario. `LoginThrottle` limita intentos por `password:<user_id>` con los limites
de login, registra fallos y reinicia al tener exito. Las contrasenas usan `SecretStr`, los DTO
ocultan sus secretos en `repr` y el manejador global de `422` elimina `input` y `ctx`.

El nuevo hash, la fecha de cambio y la revocacion de todas las otras sesiones activas se
confirman en una sola transaccion. La sesion actual y las de otros usuarios se conservan;
las operaciones concurrentes sobre la clave se serializan por usuario.

## Limitaciones conocidas

- El freno de fuerza bruta vive en la memoria del proceso: con varios workers cada uno lleva su
  propio contador. Es un puerto (`LoginThrottle`) y se reemplaza sin tocar el caso de uso.
- No hay auditoria todavia: el contexto `audit` no existe en el repositorio y no se construye un
  sistema de auditoria dentro de IAM. Cuando exista, los eventos de login, logout, rotacion,
  reutilizacion y denegacion de permiso son los primeros candidatos.
- No hay rotacion de claves JWT ni `kid`; con HS256 el secreto se rota por entorno.
- La autorizacion por permiso se evalua al inicio de cada peticion: una revocacion rige desde la
  peticion siguiente y una escritura ya autorizada que esta en curso puede completarse. No se
  reverifica dentro de la transaccion; las protecciones de consistencia si se comprueban bajo el
  lock. Cerrarlo del todo exigiria reevaluar el principal al escribir.
- La gracia conserva solo el JTI inmediatamente anterior. Reduce falsos positivos entre dos
  peticiones concurrentes o un reintento por respuesta perdida; no tolera reuso de generaciones
  mas antiguas ni elimina la necesidad de coordinar refresh entre pestanas.
- El cliente debe renovar solo ante actividad real. El backend no distingue un request real de
  un temporizador: aun con actividad continua, el tope absoluto impide sesiones ilimitadas.

## Origenes permitidos, CORS y cookies

`/auth/refresh` y `/auth/logout` validan CSRF (cookie y cabecera iguales) y que el `Origin`, si viene, este en
`NEXORA_ALLOWED_ORIGINS` (coincidencia exacta de esquema + host + puerto; `localhost` y `127.0.0.1` son
origenes distintos). Si falta el origen real, `/auth/refresh` responde 401 al vencer el access token y el
frontend lo interpreta como sesion expirada: es un error de configuracion, no de TTL. El backend registra el
motivo (categoria fija, sin valores) con el logger `nexora.auth`. CORS permite credenciales solo para esos
origenes. Las cookies: refresh `HttpOnly`, ruta `/api/v1/auth`; CSRF legible, ruta `/`; `SameSite` segun
`NEXORA_COOKIE_SAMESITE`; `Secure` solo si `NEXORA_ENVIRONMENT=production` (HTTPS); `Domain` solo si
`NEXORA_COOKIE_DOMAIN` esta definido.
