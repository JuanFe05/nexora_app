"""Freno a la fuerza bruta (S8)."""

from __future__ import annotations

from datetime import timedelta

import pytest

from nexora.identity_access.domain.exceptions.identity import AuthenticationThrottled
from nexora.identity_access.infrastructure.security.login_throttle import InMemoryLoginThrottle
from tests.support.fakes import FixedClock


def build_throttle(clock: FixedClock) -> InMemoryLoginThrottle:
    return InMemoryLoginThrottle(clock=clock, max_attempts=3, window_seconds=300, block_seconds=900)


def test_bloquea_tras_alcanzar_el_maximo_de_intentos() -> None:
    clock = FixedClock()
    throttle = build_throttle(clock)

    for _ in range(3):
        throttle.ensure_allowed("ip:usuario")
        throttle.register_failure("ip:usuario")

    with pytest.raises(AuthenticationThrottled) as error:
        throttle.ensure_allowed("ip:usuario")
    assert error.value.retry_after_seconds > 0


def test_el_bloqueo_expira_al_pasar_la_ventana() -> None:
    clock = FixedClock()
    throttle = build_throttle(clock)
    for _ in range(3):
        throttle.register_failure("ip:usuario")

    clock.advance(timedelta(seconds=901))

    throttle.ensure_allowed("ip:usuario")


def test_un_login_exitoso_limpia_los_intentos() -> None:
    clock = FixedClock()
    throttle = build_throttle(clock)
    throttle.register_failure("ip:usuario")
    throttle.register_failure("ip:usuario")

    throttle.reset("ip:usuario")
    throttle.register_failure("ip:usuario")

    throttle.ensure_allowed("ip:usuario")


def test_los_intentos_viejos_salen_de_la_ventana() -> None:
    clock = FixedClock()
    throttle = build_throttle(clock)
    throttle.register_failure("ip:usuario")
    throttle.register_failure("ip:usuario")

    clock.advance(timedelta(seconds=301))
    throttle.register_failure("ip:usuario")

    throttle.ensure_allowed("ip:usuario")


def test_claves_distintas_no_se_afectan() -> None:
    clock = FixedClock()
    throttle = build_throttle(clock)
    for _ in range(3):
        throttle.register_failure("ip:usuario")

    throttle.ensure_allowed("ip:otro-usuario")
