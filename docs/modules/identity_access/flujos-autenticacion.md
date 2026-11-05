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
8. Se inserta la sesion con el JTI del refresh, la IP y el agente de usuario.
9. Se confirma la transaccion y se limpian los intentos fallidos.
10. La respuesta trae el access token; el refresh viaja en cookie `HttpOnly` junto con la cookie
    CSRF legible por el front.

Cualquier fallo de credenciales responde siempre `401 {"detail": "Credenciales invalidas"}`.

## Refresh (rotacion)

1. Se exige el token CSRF por cabecera y se valida el `Origin` cuando el navegador lo envia.
2. Se decodifica el refresh token: firma, algoritmo configurado, emisor, audiencia, expiracion y
   `token_type`.
3. Se emite un refresh nuevo y se intenta la rotacion atomica contra el JTI vigente.
4. Si la sentencia no afecta filas:
   - la sesion sigue viva pero el JTI no coincide -> **reutilizacion**: se revoca la sesion y se
     responde `401`;
   - en cualquier otro caso la sesion esta revocada o vencida -> `401`.
5. Si rota, se emite un access token nuevo y se renuevan las cookies.

## Logout

Revoca la sesion (`fecha_revocacion`) y borra las cookies. Exige CSRF cuando hay cookie de
refresh. Tras el logout, el access token que todavia no vencio deja de servir, porque cada
request protegido verifica el estado de la sesion.

## GET /auth/me

Decodifica el access token, comprueba que la sesion este viva y que corresponda al mismo usuario,
verifica que el usuario siga activo, actualiza `fecha_ultima_actividad` y devuelve el usuario con
sus roles y permisos efectivos actuales.

## Autorizacion

```python
@router.get("/usuarios", dependencies=[Depends(require_permission("identity.users.view"))])
async def listar_usuarios() -> list[UsuarioResponse]: ...
```

La verificacion vive en el backend. Ocultar botones o rutas en React no es un control de acceso.
