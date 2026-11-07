# Flujos de autenticacion

## Login

1. El cliente envia `identificador` (nombre de usuario o correo) y `contrasena`.
2. FastAPI valida el cuerpo con Pydantic (`contrasena` es `SecretStr`).
3. El freno de fuerza bruta revisa la combinacion IP + identificador; si esta bloqueada responde
   `429` con `Retry-After` y no consulta la base.
4. El caso de uso normaliza el identificador y busca al usuario por `nombre_usuario` o `correo`.
5. Si no existe, se verifica un hash senuelo para no filtrar su existencia por tiempo de respuesta.
6. Se verifica la contrasena con Argon2id y luego el estado del usuario.
7. Se generan `sid`, refresh token y access token.
8. Se inserta la sesion con el JTI del refresh, la IP y el agente de usuario. El vencimiento
   absoluto es login + `NEXORA_SESSION_ABSOLUTE_TIMEOUT_HOURS` (12 h); el `exp` del refresh
   es el menor entre ese limite y ahora + `NEXORA_REFRESH_TOKEN_TTL_DAYS` (7 dias).
9. Se confirma la transaccion y se limpian los intentos fallidos.
10. La respuesta trae el access token; el refresh viaja en cookie `HttpOnly` junto con la cookie
    CSRF legible por el front.

Cualquier fallo de credenciales responde siempre `401 {"detail": "Credenciales invalidas"}`.

## Refresh (rotacion)

1. Se exige el token CSRF por cabecera y se valida el `Origin` cuando el navegador lo envia.
2. Se valida firma, algoritmo configurado, emisor, audiencia, claims y `token_type`. La
   expiracion se comprueba con el reloj inyectado despues de consultar la sesion: incluso
   un JWT firmado vencido permite detectar y persistir su revocacion, nunca renovar.
3. La entidad `Session` exige no revocada, ahora < vencimiento absoluto y tiempo desde la
   ultima actividad < `NEXORA_SESSION_IDLE_TIMEOUT_MINUTES` (30 min). Si vencio, se revoca,
   se confirma la transaccion y se responde `401 "Sesion no activa"`.
4. Un unico UPDATE condicionado a esa politica acepta el JTI vigente o el anterior dentro
   de `NEXORA_REFRESH_ROTATION_GRACE_SECONDS` (30 s, limite inclusivo). Mueve vigente a
   anterior, instala el nuevo JTI y registra rotacion y actividad. No extiende el absoluto.
5. Cualquier JTI mas antiguo, o anterior fuera de gracia, revoca la sesion y confirma antes
   de responder `401 "Refresh token reutilizado"`. Una sesion ya revocada responde `401`.
6. Se emite un access nuevo (10 min), se confirma y se rotan ambas cookies. El refresh
   nuevo conserva el techo de 7 dias y nunca supera el vencimiento absoluto.

Dos peticiones concurrentes con la misma cookie y un reintento tras perder la respuesta
pueden completar dentro de la gracia sin revocar la sesion. Solo se conserva una generacion
anterior: una tercera presentacion de un JTI ya mas antiguo es reutilizacion, aun en gracia.

## Logout

Revoca la sesion (`fecha_revocacion`) y borra las cookies. Exige CSRF cuando hay cookie de
refresh. Tras el logout, el access token que todavia no vencio deja de servir, porque cada
request protegido verifica el estado de la sesion.

## Logout de todos los dispositivos

`POST /auth/logout-all` exige el principal Bearer existente, no cuerpo ni CSRF (no autentica
por cookie). Un caso de uso revoca todas las sesiones de ese usuario, incluida la actual y
las vencidas no revocadas, con un UPDATE y un commit. No altera las de otros usuarios.
Responde `204` y reutiliza el borrado de cookies de logout. Access y refresh previos dejan
inmediatamente de servir en la siguiente peticion.

## GET /auth/me

Decodifica el access token, comprueba que la sesion este viva y que corresponda al mismo usuario,
verifica que el usuario siga activo y devuelve el usuario con sus roles y permisos actuales.
Como cualquier request protegido, actualiza `fecha_ultima_actividad` solo si transcurrieron
>= `NEXORA_SESSION_ACTIVITY_TOUCH_SECONDS` (60 s); el UPDATE tambien impide retroceder la
actividad o revivir una sesion vencida/revocada. Detectar inactividad o limite absoluto
revoca y confirma antes del `401`. La actividad desliza la inactividad, nunca el absoluto.
Un refresh valido siempre cuenta como actividad; el cliente debe solicitarlo solo ante
actividad real, no mantener una sesion ilimitada con un temporizador.

## Autorizacion

```python
@router.get("/usuarios", dependencies=[Depends(require_permission("identity.users.view"))])
async def listar_usuarios() -> list[UsuarioResponse]: ...
```

La verificacion vive en el backend. Ocultar botones o rutas en React no es un control de acceso.
