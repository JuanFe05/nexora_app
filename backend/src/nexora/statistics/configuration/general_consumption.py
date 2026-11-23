"""Cuotas moderadoras aprobadas por vigencia; no extrapolar a otros años."""

from collections.abc import Mapping
from types import MappingProxyType

MODERATOR_FEES: Mapping[int, frozenset[int]] = MappingProxyType(
    {
        2026: frozenset({5000, 20100, 52800}),
    }
)
