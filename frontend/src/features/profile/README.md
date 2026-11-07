# Perfil de usuario

La ruta existente `/configuracion/perfil` permite a cualquier usuario autenticado consultar y editar su propio perfil y cambiar su contraseña. No requiere el rol `ADMINISTRADOR`. Implementa T5 y las partes de perfil de S5, S8 y S9 de [iam-settings-ui](../../../../odd/tasks/iam-settings-ui.md).

## Uso

- **Datos personales** muestra el nombre de usuario de solo lectura y los roles asignados. Permite editar nombres, apellidos, teléfono y correo electrónico. Los asteriscos indican campos obligatorios. «Guardar cambios» se habilita únicamente cuando hay diferencias; al guardar muestra «Datos actualizados».
- **Seguridad** presenta una explicación breve dentro de una única tarjeta, con dos opciones: apiladas en móvil y lado a lado desde `md`, separadas por un divisor con estilos claros/oscuros de TailAdmin.
- **Acciones**: «Editar», «Cambiar contraseña» y «Cerrar todas las sesiones» reutilizan `Button` con variante `outline`, tamaño `sm` e iconos decorativos. El estilo destructivo queda reservado a la confirmación de cierre de sesiones.
- **Roles y estado**: los roles conservan su lista accesible sin fondos de color. El estado usa `Badge`: verde para «Activo», rojo para «Inactivo» (sin distinguir mayúsculas/minúsculas del backend) y neutral para otros valores, que se muestran sin modificar.
- **Cerrar todas las sesiones** abre una confirmación compartida. Cancelar no envía solicitudes; confirmar bloquea los botones mientras revoca las sesiones. Solo el éxito borra la sesión local y redirige a `/signin`; ante un fallo se conserva el acceso y se muestra un toast de error seguro.
- **Cambiar contraseña** abre el modal existente y pide la actual, una nueva de 6–24 caracteres Unicode (sin recortar espacios), con mayúscula, minúscula, número y carácter especial (puntuación o símbolo), diferente de la actual, y su confirmación. La actual conserva el límite legacy de 1–128. Los requisitos se muestran y actualizan mientras escribes. Cada campo tiene un botón accesible para mostrar u ocultar su contenido. El éxito muestra «Contraseña actualizada. Se cerraron tus otras sesiones.»; la sesión actual sigue activa.
- Si el perfil no carga, «Reintentar» vuelve a consultar el servidor. Las validaciones se muestran debajo del campo y enfocan el primero inválido. Los avisos globales usan la API existente `useToast`; las validaciones de campo permanecen en el formulario.

## Contratos y límites

| Operación | Implementación |
| --- | --- |
| `GET /profile` | Carga real, con cancelación e ignorando resultados después de desmontar. |
| `PATCH /profile` | Lista cerrada de seis campos editables; solo diferencias y espacios exteriores recortados. Nunca envía usuario, roles, estado, ID ni `null`. |
| `POST /auth/logout-all` | Sin cuerpo, bearer y las mismas convenciones de cookies/CSRF que logout; 204 revoca todas las sesiones, incluida la actual. |
| `POST /profile/password` | Solo `contrasena_actual` y `contrasena_nueva`, sin recortar; confirmación exclusivamente local. |
| Correo y nombres | Correo válido hasta 255 caracteres; nombres y apellidos de 1–100. Primer nombre, primer apellido y correo obligatorios. |
| Teléfono y opcionales | Teléfono de 1–30 caracteres si se informa. Un opcional ausente se omite; uno existente no puede vaciarse porque el backend rechaza tanto `null` como cadenas vacías. |
| `409` / `422` de perfil | Detalle del backend en aviso o mensajes de campo; se conserva la edición. |
| `400` de contraseña | Solo se marca la contraseña actual, con mensaje seguro. |
| `429` de contraseña | Usa `ApiError.retryAfter`: «Demasiados intentos. Intenta de nuevo en N segundos.»; si no es un entero seguro no negativo, pide reintentar más tarde. |

El cliente HTTP compartido añade `/api/v1` y gestiona la sesión. La UI no recibe IDs para seleccionar otro usuario; solicita la revocación global al backend, que determina el alcance y las condiciones de expiración. La política única vive en `src/lib/password-policy.ts`; el backend realiza la validación definitiva y mantiene el almacenamiento seguro (Argon2id). Las contraseñas no se almacenan en estado React, almacenamiento persistente ni logs; solo se guardan los booleanos de cumplimiento para el checklist accesible. Al iniciar una petición válida se vacían los controles y se oculta su visibilidad; los errores de contraseña nunca reproducen cuerpos ni detalles arbitrarios del servidor.

### Correo de la cabecera

`useAuth()` expone la sesión, `login`, `logout`, `logoutAll`, `hasPermission` y `reloadPrincipal`. El perfil muestra inmediatamente los datos guardados; la cabecera puede conservar el correo anterior hasta la próxima recarga del principal. La renovación automática y los fallos temporales se describen en [autenticación](../auth/README.md).

## Estructura y pruebas

- `api/profile-api.ts`: adaptador tipado y traducción segura de errores.
- `types.ts` / `validation.ts`: contrato cerrado, diferencias y validación pura.
- `hooks/`: carga de perfil y foco después de habilitar los controles.
- `components/`: formularios pequeños sobre las primitivas compartidas de TailAdmin.
- `components/security-section.tsx`: tarjeta única estilo Danger Zone: dos filas separadas por divisores (descripción a la izquierda, botón a la derecha desde `sm`; apiladas en móvil), los tres botones comparten el estilo outline,, confirmación y estado pendiente del cierre global.
- `pages/profile-page.tsx`: composición del perfil, sin cambiar ruta ni exportación por defecto.

Desde `frontend/`: `npx vitest run`, `npx tsc -b` y `npm run lint`. Las pruebas de página simulan las API y ejercitan el controlador de sesión y el guard de ruta; las del adaptador simulan el cliente HTTP compartido. No realizan solicitudes de red ni requieren credenciales. La comprobación visual en navegador y la integración contra un backend activo quedan fuera de estas pruebas deterministas.
