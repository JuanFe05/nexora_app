"""Traducción explícita de configuración persistida al contrato de aplicación."""

from nexora.statistics.application.moderator_fees import FeeSchedule
from nexora.statistics.infrastructure.persistence.models import ModeratorFeeModel


def fee_to_read(model: ModeratorFeeModel, updater_name: str | None) -> FeeSchedule:
    return FeeSchedule(
        vigencia=model.year,
        importes=tuple(sorted(model.amounts)),
        actualizado_por=updater_name,
        actualizado_en=model.updated_at,
    )
