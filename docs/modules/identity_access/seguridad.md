# Seguridad

## Controles aplicados

| Control | Implementacion |
| --- | --- |
| Hash de contrasenas | Argon2id (`argon2-cffi`), parametros por defecto de la libreria |
| Respuesta uniforme | Un unico `401 "Credenciales invalidas"` y verificacion de hash senuelo |
| Validacion de JWT | Algoritmo tomado de la configuracion (nunca del encabezado), firma, `iss`, `aud`, `exp`, `iat`, `sub`, `jti` requeridos y `token_type` esperado |
| Cookies | `HttpOnly`, `Secure` en produccion, `SameSite` configurable, `Path=/api/v1/auth` |
| CSRF | Double submit: cookie legible en `/` (`NEXORA_CSRF_COOKIE_PATH`) + cabecera `X-CSRF-Token`, comparadas con `secrets.compare_digest`, mas validacion de `Origin` |
| Revocacion inmediata | Cada request protegido verifica la sesion por `sid` en base de datos |
| Rotacion y reuso | Rotacion atomica por JTI; un refresh reutilizado revoca la sesion |
| Fuerza bruta | Bloqueo temporal por IP + identificador |
| Secretos | `NEXORA_JWT_SECRET` por entorno; en produccion se exige 32+ caracteres y se rechaza el secreto de desarrollo |
| Minimizacion | Las respuestas nunca incluyen `hash_contrasena`, `refresh_token_jti` ni el JWT de refresh |
| Logs | No se registran contrasenas, hashes, JWT, cookies ni secretos |

## Politica de contrasenas

1. El usuario que conoce su contrasena actual puede cambiarla en
   `POST /api/v1/profile/password` (12–128 caracteres para la nueva, diferente de la actual).
2. Si la olvida, contacta al administrador, que supervisa el restablecimiento.
3. El administrador autoriza el procedimiento pero nunca conoce ni establece la contrasena.
4. El usuario ingresa personalmente la nueva contrasena.
5. No existe recuperacion automatica por correo.

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
- `GET /auth/me` escribe `fecha_ultima_actividad` en cada llamada; si el volumen lo exige, habra
  que espaciar esa escritura.
