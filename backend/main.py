"""Punto de entrada de desarrollo del backend de NEXORA."""

from __future__ import annotations

import asyncio

import uvicorn

from nexora.bootstrap.app import create_app
from nexora.bootstrap.event_loop import loop_factory
from nexora.bootstrap.settings import get_settings

app = create_app()


def main() -> None:
    settings = get_settings()
    config = uvicorn.Config(app, host="127.0.0.1", port=8000, log_level="info")
    server = uvicorn.Server(config)
    print(f"{settings.app_name} escuchando en http://127.0.0.1:8000")  # noqa: T201
    asyncio.run(server.serve(), loop_factory=loop_factory)


if __name__ == "__main__":
    main()
