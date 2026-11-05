"""Traduccion explicita entre modelos ORM y entidades de dominio."""

from __future__ import annotations

from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.value_objects.enums import UserStatus
from nexora.identity_access.infrastructure.persistence.models import SessionModel, UserModel


def user_to_domain(model: UserModel) -> User:
    return User(
        id=model.id,
        username=model.username,
        email=model.email,
        password_hash=model.password_hash,
        status=UserStatus(model.status),
        first_name=model.first_name,
        last_name=model.last_name,
        middle_name=model.middle_name,
        second_last_name=model.second_last_name,
        phone_number=model.phone_number,
        password_changed_at=model.password_changed_at,
    )


def session_to_domain(model: SessionModel) -> Session:
    return Session(
        id=model.id,
        user_id=model.user_id,
        refresh_token_jti=model.refresh_token_jti,
        created_at=model.created_at,
        last_activity_at=model.last_activity_at,
        expires_at=model.expires_at,
        revoked_at=model.revoked_at,
        ip_address=model.ip_address,
        user_agent=model.user_agent,
    )


def session_to_model(session: Session) -> SessionModel:
    return SessionModel(
        id=session.id,
        user_id=session.user_id,
        refresh_token_jti=session.refresh_token_jti,
        ip_address=session.ip_address,
        user_agent=session.user_agent,
        created_at=session.created_at,
        last_activity_at=session.last_activity_at,
        expires_at=session.expires_at,
        revoked_at=session.revoked_at,
    )
