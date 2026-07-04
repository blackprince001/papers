from typing import Any, AsyncIterator

from openai import APIStatusError as OpenAIAPIStatusError
from openai import AsyncOpenAI
from openai import RateLimitError as OpenAIRateLimitError

from app.core.logger import get_logger
from app.services.ai.providers.base import (
  AIProvider,
  AIProviderError,
  AuthError,
  EmbeddingConfig,
  GenerateConfig,
  ProviderConfig,
  RateLimitError,
)

logger = get_logger(__name__)


class OpenAICompatibleProvider(AIProvider):
  """Provider for OpenAI-compatible API endpoints.

  Works with OpenAI, Azure OpenAI, Groq, Together AI, OpenRouter,
  and any other service that implements the OpenAI chat completions
  and embeddings API format.
  """

  display_name = "OpenAI Compatible"
  default_base_url = "https://api.openai.com/v1"

  def __init__(self, config: ProviderConfig) -> None:
    super().__init__(config)
    base_url = config.base_url or self.default_base_url
    self._client = AsyncOpenAI(
      api_key=config.api_key,
      base_url=base_url,
      timeout=config.timeout_seconds,
    )

  @property
  def name(self) -> str:
    return "openai-compatible"

  async def generate(self, prompt: str, config: GenerateConfig) -> str:
    messages: list[dict[str, str]] = []
    if config.system_instruction:
      messages.append({"role": "system", "content": config.system_instruction})
    messages.append({"role": "user", "content": prompt})

    try:
      kwargs: dict[str, Any] = {
        "model": config.model,
        "messages": messages,
        "temperature": config.temperature,
        "max_tokens": config.max_output_tokens or 4096,
      }
      if config.response_format:
        kwargs["response_format"] = config.response_format
      try:
        response = await self._client.chat.completions.create(**kwargs)
      except OpenAIAPIStatusError as e:
        # Some OpenAI-compatible endpoints/models reject response_format.
        # Retry once without it rather than failing the whole request.
        if config.response_format and e.status_code in (400, 422):
          logger.warning(
            "Provider rejected response_format; retrying without it",
            model=config.model,
            status=e.status_code,
          )
          kwargs.pop("response_format", None)
          response = await self._client.chat.completions.create(**kwargs)
        else:
          raise
      content = response.choices[0].message.content or ""
      return content
    except OpenAIRateLimitError as e:
      raise RateLimitError(str(e), original_error=e) from e
    except OpenAIAPIStatusError as e:
      if e.status_code == 401:
        raise AuthError(str(e), original_error=e) from e
      raise AIProviderError(str(e), original_error=e) from e
    except Exception as e:
      raise AIProviderError(str(e), original_error=e) from e

  async def generate_stream(
    self, prompt: str, config: GenerateConfig
  ) -> AsyncIterator[str]:
    messages: list[dict[str, str]] = []
    if config.system_instruction:
      messages.append({"role": "system", "content": config.system_instruction})
    messages.append({"role": "user", "content": prompt})

    try:
      kwargs: dict[str, Any] = {
        "model": config.model,
        "messages": messages,
        "temperature": config.temperature,
        "max_tokens": config.max_output_tokens or 4096,
        "stream": True,
      }
      if config.response_format:
        kwargs["response_format"] = config.response_format
      stream = await self._client.chat.completions.create(**kwargs)
      async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
          yield delta.content
    except OpenAIRateLimitError as e:
      raise RateLimitError(str(e), original_error=e) from e
    except OpenAIAPIStatusError as e:
      if e.status_code == 401:
        raise AuthError(str(e), original_error=e) from e
      raise AIProviderError(str(e), original_error=e) from e
    except Exception as e:
      raise AIProviderError(str(e), original_error=e) from e

  async def embed(self, texts: list[str], config: EmbeddingConfig) -> list[list[float]]:
    try:
      response = await self._client.embeddings.create(
        model=config.model,
        input=texts,
        dimensions=config.dimensions,
      )
      embeddings = [item.embedding for item in response.data]
      return embeddings
    except OpenAIRateLimitError as e:
      raise RateLimitError(str(e), original_error=e) from e
    except OpenAIAPIStatusError as e:
      if e.status_code == 401:
        raise AuthError(str(e), original_error=e) from e
      raise AIProviderError(str(e), original_error=e) from e
    except Exception as e:
      raise AIProviderError(str(e), original_error=e) from e

  def classify_error(self, error: Exception) -> AIProviderError:
    if isinstance(error, OpenAIRateLimitError):
      return RateLimitError(str(error), original_error=error)
    if isinstance(error, OpenAIAPIStatusError):
      if error.status_code == 401:
        return AuthError(str(error), original_error=error)
      return AIProviderError(str(error), original_error=error)
    return AIProviderError(str(error), original_error=error)


class OpenAIProvider(OpenAICompatibleProvider):
  """OpenAI API provider.

  Uses the OpenAI-compatible endpoint at https://api.openai.com/v1.
  """

  display_name = "OpenAI"
  default_base_url = "https://api.openai.com/v1"

  @property
  def name(self) -> str:
    return "openai"


class DeepSeekProvider(OpenAICompatibleProvider):
  """DeepSeek API provider.

  Uses the OpenAI-compatible endpoint at https://api.deepseek.com/v1.
  """

  display_name = "DeepSeek"
  default_base_url = "https://api.deepseek.com/v1"

  @property
  def name(self) -> str:
    return "deepseek"


class AnthropicProvider(OpenAICompatibleProvider):
  """Anthropic (Claude) API provider.

  Uses the OpenAI-compatible endpoint at https://api.anthropic.com/v1.
  """

  display_name = "Claude (Anthropic)"
  default_base_url = "https://api.anthropic.com/v1"

  @property
  def name(self) -> str:
    return "anthropic"
