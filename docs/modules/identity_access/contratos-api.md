# Contratos de API (v1)

Prefijo: `/api/v1`. Errores con forma `{"detail": "<mensaje>"}`.

## POST /api/v1/auth/login

Entrada:

```json
{ "identificador": "jperez", "contrasena": "********" }
```

Salida `200`:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 600,
  "usuario": {
    "id": "uuid",
    "nombre_usuario": "jperez",
    "correo": "jperez@nexora.co",
    "nombre_completo": "Juan Perez"
  }
}
```

Ademas establece las cookies `nexora_refresh_token` (`HttpOnly`) y `nexora_csrf_token`, ambas con
`Path=/api/v1/auth`. Roles y permisos no viajan aqui: se consultan en `GET /auth/me`.

Errores: `401` credenciales invalidas (usuario inexistente, inactivo o contrasena incorrecta),
`422` cuerpo invalido, `429` demasiados intentos (con `Retry-After`).

## POST /api/v1/auth/refresh

Sin cuerpo. Requiere la cookie de refresh y la cabecera `X-CSRF-Token` igual a la cookie CSRF.

Salida `200`: `{"access_token": "<jwt>", "token_type": "bearer", "expires_in": 600}` y cookies
rotadas. Errores: `401` por falta de CSRF, origen no permitido, token invalido o vencido, sesion
revocada o refresh reutilizado.

## POST /api/v1/auth/logout

Sin cuerpo. Requiere CSRF si hay cookie de refresh. Salida `204` y cookies borradas.

## GET /api/v1/auth/me

Cabecera `Authorization: Bearer <access_token>`.

```json
{
  "usuario": { "id": "uuid", "nombre_usuario": "jperez", "correo": "jperez@nexora.co",
               "nombre_completo": "Juan Perez" },
  "roles": ["admin_usuarios"],
  "permisos": ["identity.users.view"]
}
```

Errores: `401` sin token, token invalido o vencido, sesion revocada o usuario desactivado.

## Claims del JWT

`sub` (usuario), `sid` (sesion), `jti`, `token_type` (`access` o `refresh`), `iss`, `aud`,
`iat`, `exp`. Nunca contienen permisos ni datos personales.
