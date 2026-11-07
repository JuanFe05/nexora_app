# Perfil propio y cambio de contrasena

Cualquier usuario autenticado puede consultar y editar su propio perfil, incluso sin roles.
Estas operaciones no conceden acceso a la administracion IAM. Todas requieren
`Authorization: Bearer <access_token>` y actuan sobre el usuario del token, nunca sobre un ID
aportado en el cuerpo o la URL.

## Endpoints

| Metodo y ruta | Entrada | Salida |
| --- | --- | --- |
| `GET /api/v1/profile` | Sin cuerpo | `200` con el perfil propio |
| `PATCH /api/v1/profile` | Campos personales que se desean cambiar | `200` con el perfil actualizado |
| `POST /api/v1/profile/password` | `contrasena_actual` y `contrasena_nueva` | `204` sin cuerpo |

El perfil contiene `id`, `nombre_usuario`, `correo`, `primer_nombre`, `segundo_nombre`,
`primer_apellido`, `segundo_apellido`, `numero_telefono`, `estado` y `roles` (codigos activos).
Nunca incluye hashes, sesiones ni tokens.

## Editar datos personales

Solo se admiten `correo`, `primer_nombre`, `segundo_nombre`, `primer_apellido`,
`segundo_apellido` y `numero_telefono`. `nombre_usuario` es **de solo lectura** por decision
explicita del usuario. Enviar ese campo, `id`, `estado`, `roles` o cualquier campo desconocido
produce `422`; no se ignoran silenciosamente.

- Un campo omitido conserva su valor; `null` explicito se rechaza con `422`.
- Se recortan espacios exteriores; no se admiten cadenas vacias ni solo espacios.
- Nombres y apellidos: 1–100 caracteres; telefono: 1–30; correo: 1–255 y formato de correo.
- El correo debe ser unico sin distinguir mayusculas/minusculas. El correo actual del propio
  usuario no es un conflicto. Un correo de otro usuario produce `409` sin modificar datos.

La edicion del perfil y la creacion/edicion administrativa de usuarios serializan la
comprobacion de unicidad y la escritura con el mismo advisory lock transaccional. Como defensa
adicional, las restricciones SQL de unicidad de usuario/correo en flush o commit producen
`409 {"detail": "El nombre de usuario o el correo ya estan registrados"}`, no un error 500.

Ejemplo:

```json
{ "correo": "ana@example.test", "primer_nombre": "Ana", "numero_telefono": "3001234567" }
```

## Cambiar contrasena

```json
{ "contrasena_actual": "<actual>", "contrasena_nueva": "<nueva>" }
```

La actual admite claves legacy de 1-128 caracteres, sin requisitos de composicion; login
conserva el mismo limite. La nueva exige 6-24 code points Unicode, una mayuscula (`Lu`), una
minuscula (`Ll`), un numero (`Nd`) y un especial (`P*` o `S*`, como `@ # $ % & !`). No se
recortan espacios: cuentan para la longitud, pero no como especial.
La nueva debe ser diferente de la actual (`422` si son iguales). La validacion definitiva
reutiliza `domain/value_objects/password_policy.py`, igual que crear usuarios y bootstrap.
Las entradas son secretos; los errores de validacion nombran los requisitos que faltan y
no devuelven los valores recibidos ni su contexto interno.
[Definicion Unicode](seguridad.md#politica-de-contrasenas).

| Situacion | Resultado |
| --- | --- |
| Falta token, token invalido/vencido o sesion revocada | `401` |
| Contrasena actual incorrecta | `400 {"detail": "La contrasena actual es incorrecta"}` |
| Demasiados intentos fallidos | `429` con cabecera `Retry-After` en segundos |
| Nueva clave invalida o campos desconocidos | `422`, sin eco de secretos |
| Cambio correcto | `204`, sin cuerpo |

**400 y no 401:** una clave actual incorrecta no invalida la sesion autenticada ni debe
activar el mecanismo de refresh del cliente. Se utiliza la verificacion Argon2 existente.

**Throttle por usuario:** se reutiliza `LoginThrottle` con clave `password:<user_id>` y los
mismos limites configurados para login. Cada fallo de verificacion registra un intento; el
exito reinicia ese contador. Otro login o IP no evita el bloqueo. Como en login, el estado
actual vive en memoria por proceso.

**Otras sesiones cerradas:** en una sola transaccion se guarda el nuevo hash Argon2id,
se actualiza `fecha_cambio_contrasena` y se revocan las otras sesiones activas del usuario.
La sesion actual permanece viva; los access y refresh tokens de las otras dejan de funcionar.
Las sesiones de otros usuarios no cambian. Si falla la escritura o la revocacion, se revierte
toda la transaccion. Los cambios concurrentes de clave se serializan sobre el usuario.

Tras el cambio, login acepta la clave nueva y rechaza la anterior. No se implementa aqui
recuperacion de contrasena olvidada ni restablecimiento administrativo. Un futuro reset
administrativo debe usar el mismo modulo unico de politica.

## Referencias

- [Contratos de API](contratos-api.md)
- [Seguridad y limitaciones](seguridad.md)
