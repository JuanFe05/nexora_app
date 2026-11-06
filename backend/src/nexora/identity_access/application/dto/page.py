"""Resultado paginado independiente del transporte y de la persistencia."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Page[T]:
    items: tuple[T, ...]
    total: int
