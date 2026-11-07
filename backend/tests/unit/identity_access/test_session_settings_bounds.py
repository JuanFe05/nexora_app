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
    )
