# Feature: iam-settings-ui — Configuraciones (perfil, usuarios, permisos y roles) y ajustes de identidad

Frontend de configuracion sobre el backend IAM existente, mas los endpoints que faltaban
(perfil propio, busqueda y total en listados). Rama: `feature/develop`. Estado: en implementacion.

## Specs

- **S1** "Actualizar el slogan a: «Transformamos datos en decisiones inteligentes»."
- **S2** "En el pie de pagina del login mostrar: «NEXORA © [ANO ACTUAL]. Todos los derechos
  reservados. El uso de este sistema de software esta sujeto a los terminos de licencia». El ano
  debe obtenerse dinamicamente."
- **S3** Menu de usuario: "Mostrar el `nombre_usuario` en lugar del nombre completo. Mantener el
  correo electronico debajo. No utilizar avatar. Aplicar al boton «Cerrar sesion» el estilo de
  color rojo de TailAdmin, incluyendo icono y texto."
- **S4** Sidebar: "Cambiar la seccion MENU por INFORMES y agregar una nueva seccion llamada
  CONFIGURACIONES, con estas opciones: Perfil de usuario. Usuarios. Permisos. Roles. Utilizar
  iconos adecuados y mantener el diseno de navegacion de TailAdmin."
- **S5** Paginas independientes. "Perfil de usuario: permitir que cualquier usuario autenticado
  consulte y edite sus propios datos y cambie su contrasena, siempre que proporcione
  correctamente su contrasena actual." "Usuarios: administracion de usuarios." "Permisos:
  administracion del catalogo de permisos." "Roles: administracion de roles y sus permisos."
- **S6** "Para Usuarios, Permisos y Roles utilizar el componente TailAdmin Data Table 3,
  adaptandolo a cada entidad e incorporando busqueda, paginacion y acciones correspondientes."
- **S7** "Las opciones de administracion deben estar disponibles exclusivamente para el rol
  `ADMINISTRADOR`. El control de acceso debe aplicarse tanto en el frontend como en el backend."
- **S8** "Respetar DDD, Clean Architecture y la arquitectura existente. Integrar las paginas con los
  endpoints reales del backend. No inventar datos ni funcionalidades. Mantener la autenticacion,
  autorizacion y diseno responsive. Reutilizar componentes de TailAdmin y evitar codigo
  duplicado."
- **S9** Decisiones del usuario (L2): Data Table 3 reconstruida con componentes gratuitos de TailAdmin
  (la oficial es Pro); el perfil edita nombres, apellidos, telefono y correo, con `nombre_usuario`
  de solo lectura; al cambiar la contrasena se cierran las otras sesiones del usuario.

## Decisiones de diseno (propuestas por el agente)

- D1 Backend aditivo: `q` (busqueda) y cabecera `X-Total-Count` en los tres listados, sin cambiar el
  cuerpo actual. Endpoints propios `GET/PATCH /api/v1/profile` y `POST /api/v1/profile/password`.
- D2 Contrasena actual incorrecta responde 400 (no 401, para no disparar el refresh del cliente);
  los intentos se limitan con el `LoginThrottle` existente por usuario.
- D3 `Configuracion de la cuenta` del menu de usuario apunta a la pagina Perfil de usuario; se
  retira la ruta provisional `/cuenta`.
- D4 Las paginas viven en `features/{profile,users,roles,permissions}`; la tabla compartida en
  `components/shared/data-table`.

## Tasks

| ID | Specs | Ruta | Commit | Estado |
| --- | --- | --- | --- | --- |
| T1 Backend: busqueda `q` y `X-Total-Count` en listados | S6, S8 | worker | - | pendiente |
| T2 Backend: perfil propio y cambio de contrasena | S5, S9 | worker | - | pendiente |
| T3 Frontend base: slogan, pie, menu de usuario, sidebar por secciones y roles, rutas | S1-S4, S7 | worker | - | pendiente |
| T4 DataTable compartida (basada en table-three gratuita) | S6, S8 | worker | - | pendiente |
| T5 Pagina Perfil de usuario | S5, S9 | worker | - | pendiente |
| T6 Paginas Usuarios, Roles y Permisos | S5-S8 | worker | - | pendiente |
| T7 Documentacion, verificacion integrada y verificacion independiente | S1-S9 | inline | - | pendiente |

## Log

- **L1** Solicitud original del usuario: "NEXORA — Actualizacion del Dashboard y Configuraciones.
  Realiza los siguientes cambios en el frontend utilizando React, TypeScript y TailAdmin." con los
  puntos 1 Identidad y pie de pagina, 2 Menu de usuario, 3 Sidebar, 4 Paginas de configuracion y
  Consideraciones (texto completo en los specs S1-S8). "Inspecciona primero la implementacion
  existente y realiza los cambios de forma incremental, siguiendo ODD."
- **L2** Respuestas del usuario: Data Table 3 -> "Reconstruirla con componentes gratuitos";
  perfil -> "Datos personales y correo; usuario de solo lectura"; contrasena -> "Cerrar las otras
  sesiones".
- **L3** Exploracion: Data Table 3 es de TailAdmin Pro (react-demo.tailadmin.com/data-tables); la
  plantilla gratuita trae `table-three` (buscador, paginacion, estado vacio) y `ui/table`,
  `ui/pagination`. El backend solo expone `/auth/me` minimo y listados sin busqueda ni total.
