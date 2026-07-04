"""Multi-provider routing for BYO key architecture.

Uses the openai-agents SDK's ``MultiProvider`` to route model requests
by prefix across multiple providers configured by the user (OpenAI,
Anthropic, DeepSeek, Ollama, vLLM, or any OpenAI-compatible endpoint).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ProviderRouteConfig:
  """Configuration for a single provider route the user has configured.

  Each row in the ``user_ai_providers`` table maps to one of these.
  """

  provider_type: str
  api_key: str
  base_url: str | None = None
  model_prefix: str = ""
  default_model: str = ""
  is_active: bool = True
  timeout_seconds: int = 120


# OpenAI Agents SDK — optional dependency
try:
  from agents import MultiProvider, set_tracing_disabled
  from agents.models.multi_provider import MultiProviderMap
  from agents.models.openai_provider import OpenAIProvider
  from openai import AsyncOpenAI

  _HAS_AGENTS_SDK = True
except ImportError:
  MultiProvider = object  # type: ignore[misc,assignment]
  MultiProviderMap = object  # type: ignore[misc,assignment]
  OpenAIProvider = object  # type: ignore[misc,assignment]
  def set_tracing_disabled(_):
    return None  # type: ignore[assignment]
  AsyncOpenAI = object  # type: ignore[misc,assignment]
  _HAS_AGENTS_SDK = False


@dataclass
class BuiltProvider:
  """A fully configured provider ready for injection into MultiProvider."""

  model_prefix: str
  openai_client: AsyncOpenAI
  default_model: str
  provider_type: str


PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
  "openai": {
    "base_url": "https://api.openai.com/v1",
    "model_prefix": "openai/",
    "api_key": "",
  },
  "anthropic": {
    "base_url": "https://api.anthropic.com/v1",
    "model_prefix": "anthropic/",
    "api_key": "",
  },
  "deepseek": {
    "base_url": "https://api.deepseek.com/v1",
    "model_prefix": "deepseek/",
    "api_key": "",
  },
  "ollama": {
    "base_url": "http://localhost:11434/v1",
    "model_prefix": "ollama/",
    "api_key": "ollama",
  },
  "vllm": {
    "base_url": "http://localhost:8000/v1",
    "model_prefix": "vllm/",
    "api_key": "vllm",
  },
  "openai-compatible": {
    "base_url": "",
    "model_prefix": "custom/",
    "api_key": "",
  },
}


class MultiProviderBuilder:
  """Builds a ``MultiProvider`` from user-configured provider routes.

  Typical usage::

      builder = MultiProviderBuilder()
      builder.add_openai(api_key="sk-...")
      builder.add_anthropic(api_key="sk-ant-...")
      builder.add_ollama(base_url="http://192.168.1.50:11434/v1")
      multi_provider = builder.build()
  """

  def __init__(self) -> None:
    set_tracing_disabled(True)
    self._providers: list[BuiltProvider] = []

  def add_provider(self, config: ProviderRouteConfig) -> None:
    """Register a single provider from a config object."""
    defaults = PROVIDER_DEFAULTS.get(config.provider_type, {})
    api_key = config.api_key or defaults.get("api_key", "")
    base_url = config.base_url or defaults.get("base_url", "")
    model_prefix = config.model_prefix or defaults.get(
      "model_prefix", f"{config.provider_type}/"
    )

    client = AsyncOpenAI(
      api_key=api_key, base_url=base_url, timeout=config.timeout_seconds
    )

    self._providers.append(
      BuiltProvider(
        model_prefix=model_prefix,
        openai_client=client,
        default_model=config.default_model,
        provider_type=config.provider_type,
      )
    )
    logger.info(
      "Registered provider route",
      provider=config.provider_type,
      prefix=model_prefix,
    )

  def add_openai(
    self,
    api_key: str,
    base_url: str | None = None,
    default_model: str = "gpt-4o",
  ) -> None:
    """Register an OpenAI provider."""
    self.add_provider(
      ProviderRouteConfig(
        provider_type="openai",
        api_key=api_key,
        base_url=base_url,
        default_model=default_model,
      )
    )

  def add_anthropic(
    self,
    api_key: str,
    base_url: str | None = None,
    default_model: str = "claude-sonnet-4-20250514",
  ) -> None:
    """Register an Anthropic provider."""
    self.add_provider(
      ProviderRouteConfig(
        provider_type="anthropic",
        api_key=api_key,
        base_url=base_url,
        default_model=default_model,
      )
    )

  def add_deepseek(
    self,
    api_key: str,
    base_url: str | None = None,
    default_model: str = "deepseek-chat",
  ) -> None:
    """Register a DeepSeek provider."""
    self.add_provider(
      ProviderRouteConfig(
        provider_type="deepseek",
        api_key=api_key,
        base_url=base_url,
        default_model=default_model,
      )
    )

  def add_ollama(
    self,
    base_url: str | None = None,
    default_model: str = "llama3",
  ) -> None:
    """Register a local Ollama provider."""
    self.add_provider(
      ProviderRouteConfig(
        provider_type="ollama",
        api_key="ollama",
        base_url=base_url,
        default_model=default_model,
      )
    )

  def add_vllm(
    self,
    base_url: str | None = None,
    default_model: str = "mistral",
  ) -> None:
    """Register a local vLLM provider."""
    self.add_provider(
      ProviderRouteConfig(
        provider_type="vllm",
        api_key="vllm",
        base_url=base_url,
        default_model=default_model,
      )
    )

  def add_custom(
    self,
    api_key: str,
    base_url: str,
    model_prefix: str = "custom/",
    default_model: str = "",
  ) -> None:
    """Register any OpenAI-compatible provider with a custom prefix."""
    self.add_provider(
      ProviderRouteConfig(
        provider_type="openai-compatible",
        api_key=api_key,
        base_url=base_url,
        model_prefix=model_prefix,
        default_model=default_model,
      )
    )

  def build(self) -> MultiProvider:
    """Construct the ``MultiProvider``.

    Each registered provider gets an entry in the ``MultiProvider``
    keyed by its ``model_prefix``.  The provider is backed by an
    ``AsyncOpenAI`` client pointed at the user's chosen endpoint.
    """
    provider_map = MultiProviderMap()

    for provider in self._providers:
      # MultiProviderMap keys on a bare prefix (no trailing slash); the SDK
      # splits "prefix/model" on the first "/" to route by prefix.
      prefix = provider.model_prefix.rstrip("/")
      # Only the real OpenAI API supports the Responses API. DeepSeek, Ollama,
      # vLLM, Anthropic-via-proxy, and other OpenAI-compatible endpoints only
      # implement /chat/completions, so force Chat Completions for them.
      use_responses = provider.provider_type == "openai"
      provider_map.add_provider(
        prefix,
        OpenAIProvider(
          openai_client=provider.openai_client,
          use_responses=use_responses,
        ),
      )

    mp = MultiProvider(provider_map=provider_map, unknown_prefix_mode="model_id")

    logger.info(
      "Built MultiProvider with routes",
      count=len(self._providers),
      prefixes=[p.model_prefix for p in self._providers],
    )
    return mp

  @property
  def provider_list(self) -> list[BuiltProvider]:
    return list(self._providers)

  def get_prefix_for_model(self, model: str) -> str | None:
    """Return the provider prefix that matches *model*, or ``None``."""
    for provider in self._providers:
      if model.startswith(provider.model_prefix):
        return provider.model_prefix
    return None

  def resolve_model_name(self, model: str) -> str:
    """Strip the prefix to get the actual model name sent to the API."""
    for provider in self._providers:
      if model.startswith(provider.model_prefix):
        return model[len(provider.model_prefix) :]
    return model


def build_from_configs(
  configs: list[ProviderRouteConfig],
) -> MultiProvider:
  """Convenience function: build a ``MultiProvider`` from a list of configs."""
  builder = MultiProviderBuilder()
  for config in configs:
    if config.is_active:
      builder.add_provider(config)
  return builder.build()
