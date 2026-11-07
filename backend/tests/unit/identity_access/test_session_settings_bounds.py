import pytest
from pydantic import ValidationError

from nexora.bootstrap.settings import Settings


def test_defaults_are_compatible() -> None:
    settings = Settings(_env_file=None)
    assert settings.session_idle_timeout_minutes * 60 >= 2 * settings.session_activity_touch_seconds
    assert settings.session_idle_timeout_minutes > settings.access_token_ttl_minutes


@pytest.mark.parametrize(
    "overrides",
    [
        {"session_idle_timeout_minutes": 1, "session_activity_touch_seconds": 60},
        {"session_idle_timeout_minutes": 1, "session_activity_touch_seconds": 31},
        {"session_idle_timeout_minutes": 10, "access_token_ttl_minutes": 10},
        {"session_idle_timeout_minutes": 5, "access_token_ttl_minutes": 10},
    ],
)
def test_incompatible_idle_policy_is_rejected(overrides: dict[str, int]) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)


def test_boundary_policy_is_accepted() -> None:
    Settings(
        _env_file=None,
        session_idle_timeout_minutes=2,
        session_activity_touch_seconds=60,
        access_token_ttl_minutes=1,
        session_warning_seconds=60,
    )


def test_warning_defaults_and_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    assert Settings(_env_file=None).session_warning_seconds == 120
    monkeypatch.setenv("NEXORA_SESSION_WARNING_SECONDS", "90")
    assert Settings(_env_file=None).session_warning_seconds == 90


@pytest.mark.parametrize("seconds", [10, 600])
def test_warning_bounds_are_inclusive(seconds: int) -> None:
    assert (
        Settings(_env_file=None, session_warning_seconds=seconds).session_warning_seconds == seconds
    )


@pytest.mark.parametrize("seconds", [0, 9, 601])
def test_warning_outside_bounds_is_rejected(seconds: int) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, session_warning_seconds=seconds)


@pytest.mark.parametrize("seconds", [120, 121])
def test_warning_must_be_strictly_less_than_idle(seconds: int) -> None:
    with pytest.raises(
        ValidationError, match="El aviso debe ser menor que el tiempo de inactividad"
    ):
        Settings(
            _env_file=None,
            session_idle_timeout_minutes=2,
            session_activity_touch_seconds=60,
            access_token_ttl_minutes=1,
            session_warning_seconds=seconds,
        )


def test_warning_just_below_idle_is_accepted() -> None:
    settings = Settings(
        _env_file=None,
        session_idle_timeout_minutes=2,
        session_activity_touch_seconds=60,
        access_token_ttl_minutes=1,
        session_warning_seconds=119,
    )
    assert settings.session_warning_seconds == 119
