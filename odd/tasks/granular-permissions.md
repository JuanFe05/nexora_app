# Feature: granular-permissions — Redireccion, permisos granulares y Dialog with Form

Ajustes funcionales sobre IAM: aterrizaje en el Dashboard tras el login, autorizacion por permisos
efectivos (backend y frontend) y formularios en el Dialog de TailAdmin. Rama: `feature/develop`.
Estado: en implementacion.

## Specs

- **S1** "Al autenticarse correctamente, el usuario debe ser redirigido directamente a la pagina
  principal (Dashboard) de NEXORA."
- **S2** "Las opciones del Sidebar deben mostrarse segun los permisos efectivos del usuario
  autenticado. Para visualizar el modulo Roles se requiere el permiso `roles.view`."
- **S3** "Los permisos de consultar, crear, editar y eliminar deben funcionar de manera
  independiente. Tener permiso para eliminar no implica tener permiso para consultar, crear o
  editar. Los botones y acciones deben habilitarse unicamente cuando corresponda."
- **S4** "Aplicar las mismas restricciones en el backend; ocultar elementos en el frontend no
  constituye una medida de seguridad."
- **S5** "Verificar que los permisos asignados mediante roles se reflejen correctamente despues de
  iniciar sesion y actualizar la sesion cuando corresponda."
- **S6** "Los formularios de creacion y edicion de Usuarios, Permisos y Roles deben utilizar el
  componente TailAdmin Dialog with Form, manteniendo validaciones, estados de carga, mensajes de
  error y confirmaciones correspondientes."
- **S7** "Inspecciona la implementacion actual, identifica la causa de los problemas ... No dupliques
  logica ni modifiques funcionalidades ajenas a esta tarea. Verifica los permisos con usuarios que
  tengan diferentes combinaciones de autorizaciones."
- **S8** Decisiones del usuario (L2): `roles.view` se lee como el codigo real `identity.roles.view`
  (se mantienen los codigos `identity.*`); con limites anti-escalada.

## Causas encontradas (L3)

- Redireccion: `PublicOnlyRoute` usa `location.state.from` (ruta que se intentaba abrir) y solo cae
  en `/` si no hay ninguna.
- Backend: las 19 rutas de administracion usan `require_administrator` (rol), no permisos.
- Frontend: sidebar y rutas usan `requiredRole`/`RequireRole(ADMINISTRADOR)`; los permisos llegan en
  `/auth/me` pero la sesion solo los carga al restaurarse y nunca se refresca.
- Formularios: `FormDrawer` (Sheet). TailAdmin gratuito trae `ui/dialog.tsx` (Dialog with Form).

## Decisiones de diseno (propuestas por el agente)

- D1 Mapa permiso -> endpoint: users view (GET list/id), create (POST), update (PATCH), deactivate
  (PATCH que cambia `estado`, ademas de update), delete (DELETE), assign_roles (PUT/DELETE roles de
  un usuario); roles view/create/update/delete/assign_permissions; permissions
  view/create/update/delete. Todos con prefijo `identity.`.
- D2 Anti-escalada: solo quien tiene el rol ADMINISTRADOR asigna/revoca ese rol; nadie concede a un
  rol un permiso que no posee; las protecciones del ultimo administrador y de roles/permisos de
  sistema siguen igual.
- D3 Independencia: cada accion exige solo su permiso en la API. El frontend necesita ademas
  `view` para ver la pagina y los catalogos auxiliares (roles para asignar a usuarios, permisos para
  asignar a roles); sin ellos esa parte del formulario se deshabilita con una nota.
- D4 La sesion se refresca al volver a la pestana y tras un 403; los permisos nunca viajan en el JWT.
- D5 `FormDialog` compartido sobre `ui/dialog.tsx` reemplaza a `FormDrawer`.

## Tasks

| ID | Specs | Ruta | Commit | Estado |
| --- | --- | --- | --- | --- |
| T1 Backend: permisos granulares por endpoint + anti-escalada | S2-S5, S7, S8 | worker | - | pendiente |
| T2 Frontend: redireccion, sesion refrescable, guards y sidebar por permisos | S1, S2, S3, S5 | worker | - | pendiente |
| T3 Frontend: FormDialog + acciones por permiso en Usuarios, Roles y Permisos | S3, S6 | worker x3 | - | pendiente |
| T4 Verificacion con combinaciones de permisos, docs y verificacion independiente | S1-S8 | inline | - | pendiente |

## Log

- **L1** Solicitud original del usuario: "NEXORA — Ajustes funcionales. Realiza los siguientes
  cambios en el frontend y backend, respetando la arquitectura existente." con los puntos 1
  Redireccion despues del login, 2 Gestion granular de permisos, 3 Formularios y Consideraciones
  (texto en los specs S1-S7).
- **L2** Respuestas del usuario: codigos -> "Usar los codigos actuales identity.*"; escalada ->
  "Con limites anti-escalada".
- **L3** Exploracion: ver "Causas encontradas". Catalogo vigente: identity.users.{view,create,update,
  deactivate,delete,reset_password,assign_roles}, identity.roles.{view,create,update,delete,
  assign_permissions}, identity.permissions.{view,create,update,delete}.
