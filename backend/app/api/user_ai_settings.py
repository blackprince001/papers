"""API endpoints for user AI provider settings."""

import re
import time
from collections.abc import Sequence

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud.user_ai_settings import (
  create_user_ai_settings,
  delete_user_ai_settings,
  get_user_ai_settings,
  update_user_ai_settings,
)
from app.dependencies import CurrentUser, get_db
from app.schemas.user_ai_settings import (
  ModelInfo,
  ProviderTestRequest,
  ProviderTestResponse,
  ProviderTypeInfo,
  UserAISettingsCreate,
  UserAISettingsResponse,
  UserAISettingsUpdate,
)
from app.services.ai.provider_factory import create_provider, list_provider_types
from app.services.ai.providers.base import GenerateConfig, ProviderConfig

router = APIRouter()

OPENROUTER_URL = "https://openrouter.ai/api/v1/models"

PROVIDER_PREFIX_MAP: dict[str, str] = {
  "openai": "openai",
  "anthropic": "anthropic",
  "deepseek": "deepseek",
  "google": "gemini",
}

# DeepSeek open-weight model patterns (runnable on vLLM/Ollama).
# New releases matching these patterns are auto-classified as self-hosted.
_DEEPSEEK_OPEN_WEIGHT = re.compile(r"^(r1|chat|v3\.\d+(?:-exp|-terminus|-0324)?)")

_cache: list[ModelInfo] | None = None
_cache_ts: float = 0
_CACHE_TTL = 86400


def _categorize(provider: str, model_name: str) -> str:
  """Classify a model as 'api' (closed-source) or 'self-hosted' (open-weight)."""
  if provider in ("openai", "anthropic"):
    return "api"
  if provider == "gemini":
    return "self-hosted" if model_name.startswith("gemma") else "api"
  if provider == "deepseek":
    return "self-hosted" if _DEEPSEEK_OPEN_WEIGHT.match(model_name) else "api"
  return "api"


async def _fetch_models() -> Sequence[ModelInfo]:
  """Fetch and thin models from OpenRouter, with in-memory caching."""
  global _cache, _cache_ts  # noqa: PLW0603
  now = time.monotonic()
  if _cache is not None and now - _cache_ts < _CACHE_TTL:
    return _cache

  try:
    async with httpx.AsyncClient(timeout=10.0) as client:
      resp = await client.get(OPENROUTER_URL)
      resp.raise_for_status()
      data = resp.json()
  except Exception:
    return _cache or []

  thinned: list[ModelInfo] = []
  for entry in data.get("data", []):
    model_id: str = entry.get("id", "")
    prefix, _, model_name = model_id.partition("/")
    provider = PROVIDER_PREFIX_MAP.get(prefix)
    if provider is None:
      continue
    thinned.append(
      ModelInfo(
        provider=provider,
        model=model_name,
        name=entry.get("name", model_id),
        context_length=entry.get("context_length", 0) or 0,
        source=_categorize(provider, model_name),
      )
    )

  _cache = thinned
  _cache_ts = now
  return thinned


@router.get(
  "/user/ai-settings",
  response_model=UserAISettingsResponse | None,
)
async def get_my_ai_settings(
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Get the current user's AI provider settings."""
  settings = await get_user_ai_settings(db_session, user.id)  # type: ignore[arg-type]
  if not settings:
    return None
  return UserAISettingsResponse.model_validate(settings)


@router.put(
  "/user/ai-settings",
  response_model=UserAISettingsResponse,
)
async def set_my_ai_settings(
  data: UserAISettingsCreate,
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Create or fully replace the current user's AI settings."""
  existing = await get_user_ai_settings(db_session, user.id)  # type: ignore[arg-type]
  if existing:
    # Update existing with full replacement semantics
    existing.provider = data.provider  # type: ignore[assignment]
    if data.api_key:
      existing.set_api_key(data.api_key)
    existing.base_url = data.base_url  # type: ignore[assignment]
    existing.model = data.model  # type: ignore[assignment]
    await db_session.commit()
    await db_session.refresh(existing)
    return UserAISettingsResponse.model_validate(existing)

  settings = await create_user_ai_settings(db_session, user.id, data)  # type: ignore[arg-type]
  return UserAISettingsResponse.model_validate(settings)


@router.patch(
  "/user/ai-settings",
  response_model=UserAISettingsResponse,
)
async def update_my_ai_settings(
  data: UserAISettingsUpdate,
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Partially update the current user's AI settings."""
  settings = await update_user_ai_settings(db_session, user.id, data)  # type: ignore[arg-type]
  if not settings:
    raise HTTPException(status_code=404, detail="AI settings not found")
  return UserAISettingsResponse.model_validate(settings)


@router.delete("/user/ai-settings", status_code=204)
async def delete_my_ai_settings(
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Delete the current user's AI settings."""
  deleted = await delete_user_ai_settings(db_session, user.id)  # type: ignore[arg-type]
  if not deleted:
    raise HTTPException(status_code=404, detail="AI settings not found")
  return None


@router.get(
  "/ai/providers",
  response_model=list[ProviderTypeInfo],
)
async def list_available_providers():
  """List all registered AI provider types."""
  return [ProviderTypeInfo(**info) for info in list_provider_types()]


@router.get(
  "/ai/models",
  response_model=list[ModelInfo],
)
async def list_ai_models():
  """List available models from OpenRouter, filtered to supported providers."""
  return await _fetch_models()


@router.post(
  "/ai/providers/test",
  response_model=ProviderTestResponse,
)
async def test_ai_provider(
  data: ProviderTestRequest,
):
  """Test a provider connection by sending a minimal request.

  Creates a temporary provider instance from the given config and attempts
  a single-token generation to verify the endpoint, API key, and model.
  """
  model = data.model or "gpt-4o"
  config = ProviderConfig(
    provider=data.provider,
    api_key=data.api_key,
    base_url=data.base_url,
    model=model,
  )
  instance = create_provider(data.provider, config)
  if instance is None:
    return ProviderTestResponse(
      success=False,
      message=f"Unknown provider type: {data.provider}",
    )

  try:
    await instance.generate(
      "Respond with a single word: ok", GenerateConfig(model=model, max_output_tokens=1)
    )
    return ProviderTestResponse(success=True, message="Connection successful")
  except Exception as e:
    return ProviderTestResponse(success=False, message=str(e))
