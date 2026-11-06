"""Composicion de la siembra de acceso: se ejecuta una vez al arrancar la aplicacion."""

from __future__ import annotations

from nexora.bootstrap.container import Container
from nexora.identity_access.application.use_cases.bootstrap.initialize_access import (
    AdminCredentials,
    InitializationResult,
    InitializeAccessUseCase,
)
from nexora.identity_access.infrastructure.persistence.repositories import (
    SqlAlchemyAccessSeedRepository,
)
from nexora.identity_access.infrastructure.persistence.transaction import SqlAlchemyTransaction


async def initialize_access(container: Container) -> InitializationResult:
    settings = container.settings
    admin: AdminCredentials | None = None
    if settings.has_bootstrap_admin:
        assert settings.bootstrap_admin_password is not None  # noqa: S101
        admin = AdminCredentials(
            username=str(settings.bootstrap_admin_username).strip(),
            email=str(settings.bootstrap_admin_email).strip(),
            password=settings.bootstrap_admin_password.get_secret_value(),
            first_name=settings.bootstrap_admin_first_name,
            last_name=settings.bootstrap_admin_last_name,
        )
    async for session in container.database.session():
        use_case = InitializeAccessUseCase(
            seed=SqlAlchemyAccessSeedRepository(session),
            hasher=container.hasher,
            clock=container.clock,
            transaction=SqlAlchemyTransaction(session),
            admin=admin,
            require_admin=settings.is_production,
        )
        return await use_case.execute()
    raise RuntimeError("La sesion de base de datos no produjo ninguna conexion")
