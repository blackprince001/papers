"""Provider selection for a deep-research generation.

Deep research pins the first provider chosen for a generation. The resolver
still owns credential lookup, but a later retry/follow-up is not allowed to
silently move to another active provider when the pinned one disappears.
"""

from __future__ import annotations

from app.services.ai.agent.provider_resolver import ResolvedProvider, resolve_providers


async def resolve_generation_provider(
  db,
  *,
  user_id: int | None,
  generation,
) -> ResolvedProvider | None:
  """Resolve the generation's provider and update its non-secret pin fields.

  New generations without a pin select the user's current first provider once.
  Existing generations require the same provider row, or the same legacy
  provider type/model when the old single-settings row is in use.
  """
  preferred_id = getattr(generation, "provider_id", None)
  resolved = await resolve_providers(
    db,
    user_id,
    preferred_provider_id=int(preferred_id) if preferred_id is not None else None,
  )
  if not resolved:
    return None

  provider: ResolvedProvider | None
  if preferred_id is not None:
    provider = next(
      (item for item in resolved if item.provider_id == int(preferred_id)),
      None,
    )
  else:
    pinned_type = getattr(generation, "provider_type", None)
    pinned_model = getattr(generation, "model", None)
    if pinned_type or pinned_model:
      provider = next(
        (
          item
          for item in resolved
          if item.route.provider_type == pinned_type
          and (not pinned_model or item.route.default_model == pinned_model)
        ),
        None,
      )
    else:
      provider = resolved[0]

  if provider is None:
    return None

  generation.provider_id = provider.provider_id
  generation.provider_type = provider.route.provider_type
  generation.model = provider.route.default_model or None
  return provider
