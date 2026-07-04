from typing import Any

from app.core.logger import get_logger
from app.models.user_ai_settings import UserAISettings
from app.services.ai.providers.base import AIProvider, ProviderConfig
from app.services.ai.providers.gemini import GeminiProvider
from app.services.ai.providers.openai_compatible import (
  AnthropicProvider,
  DeepSeekProvider,
  OpenAICompatibleProvider,
  OpenAIProvider,
)

logger = get_logger(__name__)

_PROVIDER_CLASSES: dict[str, type[AIProvider]] = {
  "gemini": GeminiProvider,
  "openai-compatible": OpenAICompatibleProvider,
  "openai": OpenAIProvider,
  "deepseek": DeepSeekProvider,
  "anthropic": AnthropicProvider,
}


def create_provider(provider_type: str, config: ProviderConfig) -> AIProvider | None:
  """Create an AI provider instance for the given type and config.

  Args:
      provider_type: Provider type name (e.g. 'gemini', 'openai', 'anthropic')
      config: Provider configuration

  Returns:
      Provider instance or None if type not found
  """
  provider_class = _PROVIDER_CLASSES.get(provider_type)
  if not provider_class:
    logger.error("Unknown AI provider type", provider=provider_type)
    return None
  return provider_class(config)


def list_provider_types() -> list[dict[str, Any]]:
  """List all registered provider types with metadata."""
  result = []
  for name, cls in _PROVIDER_CLASSES.items():
    temp_instance: AIProvider | None = None
    try:
      temp_instance = cls(ProviderConfig())
    except Exception:
      pass
    result.append(
      {
        "type": name,
        "display_name": getattr(cls, "display_name", name),
        "supports_grounding": (
          temp_instance.supports_grounding if temp_instance else False
        ),
      }
    )
  return result


def create_provider_from_settings(
  ai_settings: UserAISettings,
) -> AIProvider | None:
  """Create an AI provider instance from user AI settings.

  Args:
      ai_settings: User's AI provider settings from the database

  Returns:
      Configured AI provider, or None if the provider type is unknown
  """
  config = ProviderConfig(
    provider=ai_settings.provider or "openai-compatible",  # type: ignore[arg-type]
    api_key=ai_settings.get_api_key(),
    base_url=ai_settings.base_url,  # type: ignore[arg-type]
    model=ai_settings.model,  # type: ignore[arg-type]
    timeout_seconds=getattr(ai_settings, "timeout_seconds", None) or 120,
  )

  provider = create_provider(config.provider, config)
  if provider is None:
    logger.error(
      "Could not create provider from settings",
      provider_type=config.provider,
    )
  return provider


def create_provider_from_config(
  provider_type: str,
  api_key: str,
  base_url: str | None = None,
  model: str | None = None,
  timeout_seconds: int | None = None,
) -> AIProvider | None:
  """Create an AI provider instance from explicit configuration values.

  Useful for Celery tasks and system-level operations where there
  is no user-specific settings context. Embeddings are not configured here
  — they always run through the Google embedding service.
  """
  config = ProviderConfig(
    provider=provider_type,
    api_key=api_key,
    base_url=base_url,
    model=model or "",
    timeout_seconds=timeout_seconds or 120,
  )
  return create_provider(provider_type, config)
