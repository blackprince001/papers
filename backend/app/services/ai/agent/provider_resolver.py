"""Resolve a user's AI providers into an ordered fallback chain.

Resolution order:

1. ``preferred_provider_id`` — the provider a request or chat session pins
   (a ``user_ai_providers`` row).
2. Every active ``user_ai_providers`` row (default first, then newest first),
   forming the fallback chain the chat services advance through on error.
3. The legacy ``user_ai_settings`` row (last resort for users who haven't
   migrated to the multi-provider model).

There is **no environment fallback**: if the user has configured nothing,
the chain is empty and the caller surfaces a "no provider configured" error.
(Embeddings are the sole exception and resolve Google independently.)
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.services.ai.agent.multi_provider import ProviderRouteConfig

logger = get_logger(__name__)


@dataclass
class ResolvedProvider:
  """A single provider in the resolved fallback chain.

  ``provider_id`` is ``None`` for the ``user_ai_settings`` default (it has no
  ``user_ai_providers`` row, so it cannot be pinned on a session).
  """

  provider_id: int | None
  label: str
  route: ProviderRouteConfig


async def resolve_providers(
  db_session: AsyncSession,
  user_id: int | None,
  preferred_provider_id: int | None = None,
) -> list[ResolvedProvider]:
  """Return the ordered provider fallback chain for a user.

  Order: ``preferred_provider_id`` (the session/request pin) → active
  ``user_ai_providers`` (default first, then newest) → legacy
  ``user_ai_settings`` row (last resort). Returns an empty list when the
  user has configured nothing — there is no environment fallback.
  """
  resolved: list[ResolvedProvider] = []
  if user_id is None:
    return resolved

  seen_keys: set[tuple[str, str, str | None]] = set()

  def _route_of(row) -> ProviderRouteConfig:
    return ProviderRouteConfig(
      provider_type=row.provider or "openai-compatible",
      api_key=row.get_api_key(),
      base_url=row.base_url,
      default_model=row.model,
      timeout_seconds=row.timeout_seconds or 120,
    )

  def _dedup_key(route: ProviderRouteConfig) -> tuple[str, str, str | None]:
    return (route.provider_type, route.default_model, route.base_url)

  try:
    from app.api.crud.user_ai_provider import (
      get_user_ai_provider,
      list_user_ai_providers,
    )
    from app.api.crud.user_ai_settings import get_user_ai_settings

    # 1) The pinned provider (chat session or explicit request override).
    if preferred_provider_id is not None:
      pinned = await get_user_ai_provider(db_session, user_id, preferred_provider_id)
      if pinned is not None and pinned.is_active and pinned.is_configured:
        route = _route_of(pinned)
        seen_keys.add(_dedup_key(route))
        resolved.append(
          ResolvedProvider(
            provider_id=pinned.id, label=pinned.label or pinned.provider, route=route
          )
        )

    # 2) Active providers from user_ai_providers (default first, then newest).
    rows = await list_user_ai_providers(db_session, user_id)
    for r in sorted(
      (r for r in rows if r.is_active and r.is_configured),
      key=lambda r: (-r.is_default, -r.id),
    ):
      route = _route_of(r)
      if _dedup_key(route) in seen_keys:
        continue
      seen_keys.add(_dedup_key(route))
      resolved.append(
        ResolvedProvider(provider_id=r.id, label=r.label or r.provider, route=route)
      )

    # 3) Legacy user_ai_settings row (last resort).
    settings_row = await get_user_ai_settings(db_session, user_id)
    if settings_row is not None and settings_row.is_configured:
      route = ProviderRouteConfig(
        provider_type=settings_row.provider or "openai-compatible",
        api_key=settings_row.get_api_key(),
        base_url=settings_row.base_url,
        default_model=settings_row.model,
        timeout_seconds=getattr(settings_row, "timeout_seconds", None) or 120,
      )
      if _dedup_key(route) not in seen_keys:
        seen_keys.add(_dedup_key(route))
        resolved.append(
          ResolvedProvider(
            provider_id=None, label=f"{route.provider_type} (default)", route=route
          )
        )
  except asyncio.CancelledError:
    raise
  except Exception as e:
    logger.error("Error loading user AI providers", user_id=user_id, error=str(e))

  return resolved
