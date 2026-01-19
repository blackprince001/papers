from typing import List, Optional

from google import genai
from google.genai import types
from pgvector.sqlalchemy import Vector

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)


class EmbeddingService:
  def __init__(self):
    self.client: Optional[genai.Client] = None
    self._last_api_key: Optional[str] = None
    self._initialize_client()

  def _initialize_client(self):
    """Initialize or refresh the Google GenAI client with current settings."""
    current_key = settings.GOOGLE_API_KEY
    if current_key and (not self.client or self._last_api_key != current_key):
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key
    elif not current_key:
      self.client = None
      self._last_api_key = None

  def _get_client(self) -> Optional[genai.Client]:
    """Get the current client, refreshing if API key changed."""
    self._initialize_client()
    return self.client

  def generate_embedding(
    self, text: str, task_type: str = "RETRIEVAL_DOCUMENT"
  ) -> List[float]:
    """Generate embedding for a single text.

    Args:
        text: The text to generate an embedding for.
        task_type: The task type for the embedding. Use "RETRIEVAL_DOCUMENT" for
                   documents/content, and "RETRIEVAL_QUERY" for search queries.

    Returns:
        A list of floats representing the embedding vector.
    """
    if not text or not text.strip():
      return [0.0] * self.get_embedding_dimension()

    client = self._get_client()
    if not client:
      logger.warning("No Google API client available for embedding generation")
      return [0.0] * self.get_embedding_dimension()

    try:
      result = client.models.embed_content(
        model=settings.EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
          task_type=task_type,
          output_dimensionality=settings.EMBEDDING_DIMENSION,
        ),
      )

      if result.embeddings and len(result.embeddings) > 0:
        return list(result.embeddings[0].values)
      else:
        logger.warning("No embeddings returned from API")
        return [0.0] * self.get_embedding_dimension()

    except Exception as e:
      logger.error(f"Error generating embedding: {type(e).__name__}: {e}")
      return [0.0] * self.get_embedding_dimension()

  async def generate_embedding_async(
    self, text: str, task_type: str = "RETRIEVAL_DOCUMENT"
  ) -> List[float]:
    """Async wrapper for embedding generation.

    The Google GenAI API call is fast enough that we just call it directly.
    """
    return self.generate_embedding(text, task_type)

  def generate_query_embedding(self, text: str) -> List[float]:
    """Generate embedding optimized for search queries."""
    return self.generate_embedding(text, task_type="RETRIEVAL_QUERY")

  def generate_embeddings_batch(
    self, texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT"
  ) -> List[List[float]]:
    """Generate embeddings for multiple texts at once."""
    if not texts:
      return []

    client = self._get_client()
    if not client:
      logger.warning("No Google API client available for batch embedding generation")
      return [[0.0] * self.get_embedding_dimension()] * len(texts)

    # Filter out empty texts but track their positions
    non_empty_indices = []
    non_empty_texts = []
    for i, t in enumerate(texts):
      if t and t.strip():
        non_empty_indices.append(i)
        non_empty_texts.append(t)

    if not non_empty_texts:
      return [[0.0] * self.get_embedding_dimension()] * len(texts)

    try:
      result = client.models.embed_content(
        model=settings.EMBEDDING_MODEL,
        contents=non_empty_texts,
        config=types.EmbedContentConfig(
          task_type=task_type,
          output_dimensionality=settings.EMBEDDING_DIMENSION,
        ),
      )

      # Build full results list with zeros for empty texts
      full_results: List[List[float]] = [[0.0] * self.get_embedding_dimension()] * len(
        texts
      )

      if result.embeddings:
        for idx, embedding in zip(non_empty_indices, result.embeddings, strict=True):
          full_results[idx] = list(embedding.values)

      return full_results

    except Exception as e:
      logger.error(f"Error generating batch embeddings: {type(e).__name__}: {e}")
      return [[0.0] * self.get_embedding_dimension()] * len(texts)

  def get_embedding_dimension(self) -> int:
    """Return the configured embedding dimension."""
    return settings.EMBEDDING_DIMENSION

  def text_to_vector(self, text: str) -> Vector:
    """Convert text to a pgvector Vector."""
    embedding = self.generate_embedding(text)
    return Vector(embedding)


embedding_service = EmbeddingService()
