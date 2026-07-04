"""Helper functions for getting AI providers within services."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud.user_ai_settings import get_user_ai_settings
from app.core.logger import get_logger
from app.services.ai.provider_factory import (
  create_provider_from_config,
  create_provider_from_settings,
)
from app.services.ai.providers.base import AIProvider

logger = get_logger(__name__)


class ProviderLookupError(Exception):
  """The provider lookup itself failed (e.g., a transient DB error).

  This is distinct from "no provider configured" — which returns ``None`` so
  the caller cleanly skips the AI step. A ``ProviderLookupError`` means we
  could not determine *whether* a provider exists, so the caller should retry
  rather than wrongly report the user as having no provider.
  """


def get_provider_for_user_sync(
  user_id: int | None,
) -> AIProvider | None:
  """Synchronous provider resolution for Celery tasks.

  Resolution order (no environment fallback):
  1. The user's default or newest active ``user_ai_providers`` row.
  2. The legacy ``user_ai_settings`` row (last resort).
  3. ``None`` — the caller skips the AI step (it cannot run without a key).

  Raises:
      ProviderLookupError: if a lookup query fails (transient/unexpected),
          so the caller can retry instead of treating it as "no provider".
  """
  if user_id is None:
    logger.warning("No user_id given for provider resolution (sync)")
    return None

  from app.core.database import SyncSessionLocal

  # 1) Newest active or default provider from user_ai_providers.
  try:
    from app.models.user_ai_provider import UserAIProvider

    with SyncSessionLocal() as db_session:
      rows = (
        db_session.query(UserAIProvider)
        .filter(UserAIProvider.user_id == user_id)
        .filter(UserAIProvider.is_active.is_(True))
        .all()
      )
      configured = sorted(
        (r for r in rows if r.is_configured), key=lambda r: (-r.is_default, -r.id)  # type: ignore[arg-type,operator]
      )
      if configured:
        row = configured[0]
        provider = create_provider_from_config(
          provider_type=row.provider or "openai-compatible",  # type: ignore[arg-type]
          api_key=row.get_api_key(),
          base_url=row.base_url,  # type: ignore[arg-type]
          model=row.model,  # type: ignore[arg-type]
          timeout_seconds=row.timeout_seconds or 120,  # type: ignore[arg-type]
        )
        if provider:
          return provider
  except Exception as e:
    # The query/credential read failed — this is transient, not "no provider".
    logger.error(
      "Error loading user AI providers (sync)", user_id=user_id, error=str(e)
    )
    raise ProviderLookupError(str(e)) from e

  # 2) Legacy user_ai_settings row (last resort).
  try:
    from app.models.user_ai_settings import UserAISettings

    with SyncSessionLocal() as db_session:
      row = (
        db_session.query(UserAISettings)
        .filter(UserAISettings.user_id == user_id)
        .first()
      )
      if row is not None and row.is_configured:
        provider = create_provider_from_settings(row)
        if provider:
          return provider
  except Exception as e:
    logger.error("Error loading user AI settings (sync)", user_id=user_id, error=str(e))
    raise ProviderLookupError(str(e)) from e

  # Both lookups succeeded and found nothing — genuinely no provider.
  logger.warning("No AI provider configured for user (sync)", user_id=user_id)
  return None


async def get_provider_for_user(
  db_session: AsyncSession | None = None,
  user_id: int | None = None,
  preferred_provider_id: int | None = None,
) -> AIProvider | None:
  """Get the AI provider configured for a user (no environment fallback).

  Resolution order:
  1. ``preferred_provider_id`` — a specific saved ``user_ai_providers`` row.
  2. The user's default provider from ``user_ai_providers``.
  3. The newest active ``user_ai_providers`` row.
  4. The legacy ``user_ai_settings`` row (last resort).
  5. None (nothing configured — the caller surfaces the error).

  Args:
      db_session: Database session (required if user_id is given)
      user_id: User ID to look up settings for
      preferred_provider_id: A specific saved provider to prefer

  Returns:
      Configured AI provider or None
  """
  if user_id is not None and db_session is not None:
    # 1) Explicit pin.
    if preferred_provider_id is not None:
      provider = await _provider_from_saved(db_session, user_id, preferred_provider_id)
      if provider:
        return provider

    # 2) Newest active or default provider from user_ai_providers.
    provider = await _provider_from_saved(db_session, user_id, None)
    if provider:
      return provider

    # 3) Legacy user_ai_settings row (last resort).
    try:
      ai_settings = await get_user_ai_settings(db_session, user_id)
      if ai_settings and ai_settings.is_configured:
        provider = create_provider_from_settings(ai_settings)
        if provider:
          return provider
    except Exception as e:
      logger.error("Error loading user AI settings", user_id=user_id, error=str(e))

  logger.warning("No AI provider configured", user_id=user_id)
  return None


async def _provider_from_saved(
  db_session: AsyncSession,
  user_id: int,
  preferred_provider_id: int | None,
) -> AIProvider | None:
  """Build an AIProvider from the user's saved ``user_ai_providers``."""
  try:
    from app.api.crud.user_ai_provider import (
      get_default_provider,
      get_user_ai_provider,
    )

    row = None
    if preferred_provider_id is not None:
      row = await get_user_ai_provider(db_session, user_id, preferred_provider_id)
      if row is not None and not (row.is_active and row.is_configured):  # type: ignore[operator]
        row = None
    if row is None:
      row = await get_default_provider(db_session, user_id)
    if row is None or not row.is_configured:
      return None

    return create_provider_from_config(
      provider_type=row.provider or "openai-compatible",  # type: ignore[arg-type]
      api_key=row.get_api_key(),
      base_url=row.base_url,  # type: ignore[arg-type]
      model=row.model,  # type: ignore[arg-type]
      timeout_seconds=row.timeout_seconds or 120,  # type: ignore[arg-type]
    )
  except Exception as e:
    logger.error("Error loading user AI providers", user_id=user_id, error=str(e))
    return None
