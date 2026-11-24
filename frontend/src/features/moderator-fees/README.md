# Cuotas Moderadoras

Pantalla de Configuración en `/configuracion/cuotas-moderadoras`, cargada de forma lazy.
Requiere `statistics.administrative.moderator_fees.view`. Con solo ese permiso muestra
la tabla de vigencias, importes en COP (`es-CO`) y auditoría del último cambio.

`statistics.administrative.moderator_fees.manage` habilita **Nueva vigencia**,
**Editar** y **Eliminar** (con confirmación). El formulario admite vigencias enteras
2000–2100 y entre 1 y 10 importes enteros únicos, de 1 a 1.000.000 COP.
**Agregar importe** (con icono +) y **Quitar** permiten mantener esa lista: agregar se
bloquea a los 10 con una ayuda visible; quitar se bloquea cuando queda uno. La vigencia
es de solo lectura al editar, con candado y explicación.

El componente de feature `NumberStepperInput` reutiliza Input/Button de TailAdmin.
Sus botones −/+ y las teclas ArrowDown/ArrowUp ajustan **1.000 COP**, conservando el
resto (5.123 → 6.123); el resultado se limita al intervalo 1–1.000.000 y los botones
se deshabilitan en los extremos. Un campo vacío se inicializa en 1 al usar el stepper.
Se permite escribir cualquier importe exacto; escribir fuera del rango no lo corrige
silenciosamente: Guardar muestra el error. El input de texto con teclado numérico no
tiene spinners nativos. Sin foco muestra miles `es-CO` (por ejemplo `$5.000`); con foco
muestra dígitos sin separadores para no desplazar el cursor. La API sigue recibiendo enteros.

El diálogo soporta modo oscuro, foco de marca y errores con icono, `aria-invalid` y
`aria-describedby`; el primer campo inválido recibe el foco. Las operaciones pendientes
bloquean el cierre y los controles, y Guardar muestra spinner y «Guardando…».

## API

Se utiliza el cliente HTTP autenticado compartido:

- `GET /statistics/administrative/moderator-fees`: array de filas
  `{vigencia, importes, actualizado_por, actualizado_en}`; usuario nullable y fecha ISO-8601.
  La tabla ordena por vigencia descendente y aplica búsqueda/paginación localmente.
- `PUT /statistics/administrative/moderator-fees/{vigencia}`: upsert con
  `{importes: number[]}`; devuelve la fila (200).
- `DELETE /statistics/administrative/moderator-fees/{vigencia}`: sin cuerpo (204).
- Los errores de negocio/autorización muestran el `detail` en español del backend.

Las pruebas de página simulan el módulo API; no necesitan el backend.
