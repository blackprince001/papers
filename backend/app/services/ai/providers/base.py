from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, AsyncIterator


@dataclass
class ProviderConfig:
  provider: str = "openai-compatible"
  api_key: str = ""
  base_url: str | None = None
  model: str = ""
  embedding_model: str = ""
  embedding_dimension: int = 768
  timeout_seconds: int = 120


@dataclass
class GenerateConfig:
  model: str
  system_instruction: str | None = None
  temperature: float = 0.7
  max_output_tokens: int | None = None
  response_format: dict[str, Any] | None = None


@dataclass
class EmbeddingConfig:
  model: str
  task_type: str = "RETRIEVAL_DOCUMENT"
  dimensions: int | None = None


class AIProviderError(Exception):
  """Base error for AI provider operations."""

  def __init__(self, message: str, original_error: Exception | None = None):
    super().__init__(message)
    self.original_error = original_error


class RateLimitError(AIProviderError):
  """Raised when the provider rate-limits the request."""

  pass


class AuthError(AIProviderError):
  """Raised on authentication/API key issues."""

  pass


class AIProvider(ABC):
  """Abstract base class for AI providers.

  Implementations wrap provider-specific SDKs (OpenAI, Gemini, etc.)
  behind a unified interface.
  """

  config: ProviderConfig

  def __init__(self, config: ProviderConfig) -> None:
    self.config = config

  @property
  @abstractmethod
  def name(self) -> str:
    """Human-readable provider name (e.g. 'openai', 'gemini')."""
    ...

  @property
  def supports_file_upload(self) -> bool:
    """Whether this provider supports file upload (e.g. PDF for Gemini)."""
    return False

  @property
  def supports_grounding(self) -> bool:
    """Whether this provider supports search grounding / citations."""
    return False

  @abstractmethod
  async def generate(self, prompt: str, config: GenerateConfig) -> str:
    """Generate a text response for the given prompt.

    Args:
        prompt: The user/prompt text
        config: Generation parameters

    Returns:
        Generated text with citations embedded if applicable
    """
    ...

  @abstractmethod
  async def generate_stream(
    self, prompt: str, config: GenerateConfig
  ) -> AsyncIterator[str]:
    """Stream a text response chunk by chunk."""
    ...
    if False:
      yield ""

  @abstractmethod
  async def embed(self, texts: list[str], config: EmbeddingConfig) -> list[list[float]]:
    """Generate embeddings for a list of texts.

    Args:
        texts: List of text strings to embed
        config: Embedding parameters

    Returns:
        List of embedding vectors
    """
    ...

  async def upload_file(self, file_path: str) -> str | None:
    """Upload a file for AI processing (e.g. PDF for Gemini).

    Args:
        file_path: Path to the file to upload

    Returns:
        File URI if the provider supports file uploads, None otherwise
    """
    return None

  def classify_error(self, error: Exception) -> AIProviderError:
    """Classify a provider error into a standard error type.

    Override in subclasses to handle provider-specific errors.
    """
    return AIProviderError(str(error), original_error=error)
