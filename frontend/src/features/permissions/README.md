# Permisos

Administración del catálogo conectado a los endpoints existentes de `/permissions`.
La ruta exige `identity.permissions.view`; crear, editar y eliminar mantienen sus
permisos RBAC independientes y la autorización definitiva del backend.

## Estructura compartida

Igual que Usuarios y Roles: `space-y-6`, `PageHeader` y tarjeta `DataTable`, con
`KeyIcon`, títulos y descripciones. Columnas: **Código**, **Nombre**, **Módulo**,
**Descripción** y **Acciones** (cuando hay permisos de mutación). El código técnico
conserva su tipografía monoespaciada; el módulo usa `Badge variant="brand"` de texto,
sin iconos; una descripción nula se presenta como «—».

`DataTable`/`usePagedQuery` comparten buscador, tamaños **10/25/50/100**, resumen y
paginación. La búsqueda se limita a 100 caracteres y consulta al servidor tras
300 ms. `RowActionButton` conserva los nombres accesibles de editar/eliminar;
**Nuevo permiso** mantiene su `PlusIcon` decorativo. Carga, error con reintento,
catálogo vacío y búsqueda sin resultados conservan sus estados existentes.

Los formularios y la confirmación de eliminación siguen usando los diálogos
existentes, con sus validaciones, bloqueo pendiente, toasts y recarga tras éxito.
Un guardado sin cambios no muta ni recarga. Las protecciones y conflictos del
backend se siguen mostrando sin modificar el contrato de API.

## Verificación

Desde `frontend/`: `npx vitest run src/features/users src/features/roles src/features/permissions`,
`npx vitest run`, `npx tsc -b` y `npm run lint`.
Las pruebas simulan API y autorización; comprueban la estructura común, columnas,
badges, acciones por permisos, operaciones, búsqueda y paginación. jsdom no verifica
la apariencia responsive real, ambos temas en navegador ni la integración con un
backend en ejecución.
