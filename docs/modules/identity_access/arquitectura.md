# Arquitectura del modulo

## Capas y direccion de dependencias

```
presentation/http/v1  ->  application  ->  domain
infrastructure        ->  application (implementa sus puertos)
bootstrap             ->  todas (composicion)
```

- `domain`: entidades (`User`, `Role`, `Permission`, `Session`), value objects y excepciones.
  Son dataclasses puras: no importan FastAPI, SQLAlchemy, Pydantic ni PyJWT. Una prueba de
  arquitectura (`tests/unit/test_architecture.py`) falla si alguien rompe esta regla.
- `application`: casos de uso y los puertos que necesitan, declarados como `typing.Protocol`
  (`UserRepository`, `SessionRepository`, `AccessRepository`, `PasswordHasher`, `TokenService`,
  `LoginThrottle`, `Clock`, `Transaction`). No conoce infraestructura ni presentacion.
- `infrastructure`: repositorios SQLAlchemy, mappers ORM <-> dominio, Argon2id, JWT y el freno
  de fuerza bruta.
- `presentation/http/v1`: routers, schemas Pydantic, cookies/CSRF y dependencias de FastAPI.
- `bootstrap`: `Settings`, `Database`, `Container` y `create_app()`.

## Decisiones

1. **Puertos como `Protocol`, no clases base abstractas.** Evita herencia ceremonial y permite
   que los dobles de prueba sean objetos simples.
2. **Sin repositorio generico ni Unit of Work abstracta.** La transaccion es un puerto con
   `commit`/`rollback` respaldado por la `AsyncSession` del request.
3. **Tablas y columnas en espanol, codigo en ingles.** El MER aprobado manda sobre la base de
   datos; los modelos mapean con `mapped_column("primer_nombre")`.
4. **Los permisos no viajan en el JWT.** Se consultan por request, de modo que quitar un rol o
   revocar una sesion surte efecto inmediato sin esperar a que venza el access token.
5. **Una sola consulta con joins** resuelve roles y permisos efectivos (sin N+1).
6. **Rotacion del refresh en una sola sentencia** `UPDATE ... WHERE id = :sid AND
   refresh_token_jti = :jti AND fecha_revocacion IS NULL AND fecha_vencimiento > now`: si no
   afecta filas, la sesion murio o el token fue reutilizado.
7. **Freno de fuerza bruta en memoria del proceso.** Es un puerto: cambiarlo por un almacen
   compartido no toca el caso de uso.
8. **`SelectorEventLoop` en Windows**, porque psycopg async no funciona sobre `ProactorEventLoop`.

## Estructura

```
src/nexora/
  bootstrap/        settings.py, database.py, container.py, app.py, event_loop.py
  shared_kernel/    persistence.py (DeclarativeBase), clock.py
  migrations/       env.py, versions/
  identity_access/
    domain/         entities/, value_objects/, exceptions/
    application/    dto/, ports/, use_cases/authentication/
    infrastructure/ persistence/{models,mappers,repositories,transaction}, security/
    presentation/   http/v1/{routers,schemas,dependencies,cookies.py,router.py}
```
