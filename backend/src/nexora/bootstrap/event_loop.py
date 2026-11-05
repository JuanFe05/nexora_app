"""Seleccion del event loop compatible con el driver async de PostgreSQL.

psycopg en modo async no funciona sobre `ProactorEventLoop` (el loop por defecto de Windows),
asi que en Windows se usa `SelectorEventLoop`. En Linux y macOS no cambia nada.
"""

from __future__ import annotations

import asyncio
import sys


def loop_factory() -> asyncio.AbstractEventLoop:
    if sys.platform == "win32":
        return asyncio.SelectorEventLoop()
    return asyncio.new_event_loop()
