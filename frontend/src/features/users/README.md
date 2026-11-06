# Usuarios

Administración conectada a `/api/v1/users`. La ruta existente exige `ADMINISTRADOR`;
la autorización efectiva y las protecciones del último administrador se aplican en el backend.
No se cambia el guard, la sesión ni el cliente HTTP compartido.

## Uso

- Buscar consulta el servidor tras 300 ms; paginación y tamaño usan `X-Total-Count`.
- **Nuevo usuario** solicita usuario, correo, primer nombre, primer apellido y contraseña
  (12–128 caracteres). La contraseña solo existe en el control del formulario y en la
  petición de creación; se limpia tras la respuesta y nunca se muestra en errores.
- **Editar** permite datos personales, estado y roles. Envía un único PATCH con los campos
  modificados (ninguno si solo cambian roles), seguido de asignaciones y revocaciones.
  Los campos opcionales existentes no pueden vaciarse: PATCH rechaza null y cadenas vacías.
  Correo sigue el contrato real de texto no vacío, hasta 255 caracteres.
- El catálogo de roles se carga completo en páginas de 100 desde un adaptador local;
  un fallo bloquea el guardado y ofrece **Reintentar roles**. Códigos ausentes se conservan.
- El guardado **no es atómico**: ante un fallo el panel permanece abierto, indica el paso
  fallido y los pasos ya confirmados, y recarga la tabla. Reintentar no repite pasos confirmados.
  Ante pérdida de conexión puede haber un resultado incierto: comprobar la tabla y volver
  a abrir el panel antes de decidir un nuevo intento. Cancelar no revierte pasos aplicados.
- **Eliminar** exige confirmación e identifica al usuario. Cancelar no envía peticiones;
  éxito recarga el listado y ajusta la última página. Un conflicto conserva el diálogo.

Errores 404/409 muestran el `detail` del backend; 401/403/red tienen mensajes seguros.
422 se asocia a campos mediante `loc`, sin mostrar `input`, `ctx` ni mensajes crudos
que puedan contener contraseñas. Las restricciones del cliente se muestran bajo el campo,
con `aria-invalid`, asociación de mensaje y foco en el primer error.

## Límites y verificación

API, validación, coordinación de mutaciones y presentación viven separadas dentro de
este módulo. Se consumen DataTable/usePagedQuery/pagedResult, FormDrawer, ConfirmDialog,
InlineAlert y controles compartidos sin duplicarlos. No existe restablecimiento de contraseña.

Desde `frontend/`: `corepack pnpm test src/features/users`.
Las pruebas de página simulan los módulos de API, no la red. Las de adaptadores comprueban
el cliente HTTP compartido y el catálogo paginado. Se requiere comprobación visual en navegador
para ambos temas y pantallas móviles; jsdom no demuestra apariencia ni conectividad real.
