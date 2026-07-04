import asyncio
from typing import AsyncIterator

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

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
from app.utils.citation_extractor import add_citations

logger = get_logger(__name__)


class GeminiProvider(AIProvider):
  """Provider for Google Gemini API.

  Supports file upload, search grounding, and citation extraction.
  Falls back gracefully when these features are unavailable.
  """

  def __init__(self, config: ProviderConfig) -> None:
    super().__init__(config)
    self._client = genai.Client(
      api_key=config.api_key,
      http_options={"timeout": config.timeout_seconds * 1000},
    )
    self._model = config.model or "gemini-3-flash-preview"

  @property
  def name(self) -> str:
    return "gemini"

  @property
  def supports_file_upload(self) -> bool:
    return True

  @property
  def supports_grounding(self) -> bool:
    return True

  def _build_generate_config(
    self, config: GenerateConfig
  ) -> types.GenerateContentConfig:
    grounding_tool = types.Tool(google_search=types.GoogleSearch())
    return types.GenerateContentConfig(
      tools=[grounding_tool],
      temperature=config.temperature,
      max_output_tokens=config.max_output_tokens,
      system_instruction=(
        config.system_instruction if config.system_instruction else None
      ),
    )

  async def generate(self, prompt: str, config: GenerateConfig) -> str:
    try:
      response = await asyncio.to_thread(
        self._client.models.generate_content,
        model=config.model or self._model,
        contents=prompt,
        config=self._build_generate_config(config),
      )
      return add_citations(response)
    except (ConnectionError, TimeoutError, OSError):
      raise
    except genai_errors.ServerError as e:
      error_str = str(e)
      if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
        raise RateLimitError(error_str, original_error=e) from e
      raise AIProviderError(error_str, original_error=e) from e
    except genai_errors.ClientError as e:
      raise AuthError(str(e), original_error=e) from e
    except genai_errors.APIError as e:
      raise AIProviderError(str(e), original_error=e) from e
    except Exception as e:
      raise AIProviderError(str(e), original_error=e) from e

  async def generate_stream(
    self, prompt: str, config: GenerateConfig
  ) -> AsyncIterator[str]:
    try:
      response = await asyncio.to_thread(
        self._client.models.generate_content,
        model=config.model or self._model,
        contents=prompt,
        config=self._build_generate_config(config),
      )
      full_content = add_citations(response)
      chunk_size = 50
      for i in range(0, len(full_content), chunk_size):
        yield full_content[i : i + chunk_size]
        await asyncio.sleep(0.01)
    except (ConnectionError, TimeoutError, OSError):
      raise
    except genai_errors.ServerError as e:
      error_str = str(e)
      if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
        raise RateLimitError(error_str, original_error=e) from e
      raise AIProviderError(error_str, original_error=e) from e
    except genai_errors.ClientError as e:
      raise AuthError(str(e), original_error=e) from e
    except genai_errors.APIError as e:
      raise AIProviderError(str(e), original_error=e) from e
    except Exception as e:
      raise AIProviderError(str(e), original_error=e) from e

  async def embed(self, texts: list[str], config: EmbeddingConfig) -> list[list[float]]:
    try:
      embed_config = types.EmbedContentConfig(
        task_type=config.task_type,
        output_dimensionality=config.dimensions,
      )
      result = await asyncio.to_thread(
        self._client.models.embed_content,
        model=config.model,
        contents=texts,
        config=embed_config,
      )
      if result.embeddings:
        return [list(emb.values) for emb in result.embeddings]
      return []
    except (ConnectionError, TimeoutError, OSError):
      raise
    except genai_errors.APIError as e:
      logger.error("Error generating embeddings with Gemini", error=str(e))
      raise AIProviderError(str(e), original_error=e) from e
    except Exception as e:
      logger.error("Unexpected error generating embeddings", error=str(e))
      raise AIProviderError(str(e), original_error=e) from e

  async def upload_file(self, file_path: str) -> str | None:
    """Upload a file to Gemini and return its URI.

    Returns None if the upload fails.
    """
    try:
      uploaded_file = await asyncio.to_thread(self._client.files.upload, file=file_path)
      logger.info("Uploaded file to Gemini", file_path=file_path, uri=uploaded_file.uri)
      return uploaded_file.uri
    except genai_errors.APIError as e:
      logger.error(
        "Failed to upload file to Gemini",
        file_path=file_path,
        error=str(e),
      )
      return None

  def classify_error(self, error: Exception) -> AIProviderError:
    if isinstance(error, genai_errors.ServerError):
      if "429" in str(error) or "RESOURCE_EXHAUSTED" in str(error):
        return RateLimitError(str(error), original_error=error)
      return AIProviderError(str(error), original_error=error)
    if isinstance(error, genai_errors.ClientError):
      return AuthError(str(error), original_error=error)
    if isinstance(error, genai_errors.APIError):
      return AIProviderError(str(error), original_error=error)
    return AIProviderError(str(error), original_error=error)

  @property
  def model(self) -> str:
    return self._model

  @model.setter
  def model(self, value: str) -> None:
    self._model = value
