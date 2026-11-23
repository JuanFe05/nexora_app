# Cuotas Moderadoras

Pantalla de Configuración en `/configuracion/cuotas-moderadoras`, cargada de forma lazy.
Requiere `statistics.administrative.moderator_fees.view`. Con solo ese permiso muestra
la tabla de vigencias, importes en COP (`es-CO`) y auditoría del último cambio.

`statistics.administrative.moderator_fees.manage` habilita **Nueva vigencia**,
**Editar** y **Eliminar** (con confirmación). El formulario admite vigencias enteras
2000–2100 y entre 1 y 10 importes enteros únicos, de 1 a 10.000.000 COP.
**Agregar importe** y **Quitar** permiten mantener esa lista. La vigencia es de solo
lectura al editar. Los errores se asocian a los campos y el primer campo inválido
recibe el foco. Las operaciones pendientes bloquean el cierre y los controles.

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
