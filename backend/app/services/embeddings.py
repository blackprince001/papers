from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pgvector.sqlalchemy import Vector

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

TASK_TYPE_DOCUMENT = "RETRIEVAL_DOCUMENT"
TASK_TYPE_QUERY = "RETRIEVAL_QUERY"


class EmbeddingService:
  def __init__(self) -> None:
    self.client: genai.Client | None = None
    self._last_api_key: str | None = None
    self._initialize_client()

  def _initialize_client(self) -> None:
    current_key = settings.GOOGLE_API_KEY
    if not current_key:
      self.client = None
      self._last_api_key = None
      return

    if self.client is None or self._last_api_key != current_key:
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key

  def _get_client(self) -> genai.Client | None:
    self._initialize_client()
    return self.client

  def _get_zero_embedding(self) -> list[float]:
    return [0.0] * settings.EMBEDDING_DIMENSION

  def _create_embed_config(self, task_type: str) -> types.EmbedContentConfig:
    return types.EmbedContentConfig(
      task_type=task_type,
      output_dimensionality=settings.EMBEDDING_DIMENSION,
    )

  def generate_embedding(
    self, text: str, task_type: str = TASK_TYPE_DOCUMENT
  ) -> list[float]:
    if not text or not text.strip():
      return self._get_zero_embedding()

    client = self._get_client()
    if not client:
      logger.warning("No Google API client available")
      return self._get_zero_embedding()

    try:
      result = client.models.embed_content(
        model=settings.EMBEDDING_MODEL,
        contents=text,
        config=self._create_embed_config(task_type),
      )
      if result.embeddings and len(result.embeddings) > 0:
        return list(result.embeddings[0].values)
      return self._get_zero_embedding()
    except genai_errors.APIError as e:
      logger.error("Error generating embedding", error=str(e))
      return self._get_zero_embedding()

  async def generate_embedding_async(
    self, text: str, task_type: str = TASK_TYPE_DOCUMENT
  ) -> list[float]:
    return self.generate_embedding(text, task_type)

  def generate_query_embedding(self, text: str) -> list[float]:
    return self.generate_embedding(text, task_type=TASK_TYPE_QUERY)

  def _filter_empty_texts(self, texts: list[str]) -> tuple[list[int], list[str]]:
    indices: list[int] = []
    filtered_texts: list[str] = []
    for i, text in enumerate(texts):
      if text and text.strip():
        indices.append(i)
        filtered_texts.append(text)
    return indices, filtered_texts

  def _build_batch_results(
    self, texts: list[str], indices: list[int], embeddings: Any
  ) -> list[list[float]]:
    results: list[list[float]] = [self._get_zero_embedding() for _ in texts]
    if not embeddings:
      return results
    for idx, embedding in zip(indices, embeddings, strict=True):
      results[idx] = list(embedding.values)
    return results

  def generate_embeddings_batch(
    self, texts: list[str], task_type: str = TASK_TYPE_DOCUMENT
  ) -> list[list[float]]:
    if not texts:
      return []

    client = self._get_client()
    if not client:
      logger.warning("No Google API client available for batch embedding")
      return [self._get_zero_embedding() for _ in texts]

    indices, filtered_texts = self._filter_empty_texts(texts)
    if not filtered_texts:
      return [self._get_zero_embedding() for _ in texts]

    try:
      result = client.models.embed_content(
        model=settings.EMBEDDING_MODEL,
        contents=filtered_texts,
        config=self._create_embed_config(task_type),
      )
      return self._build_batch_results(texts, indices, result.embeddings)
    except genai_errors.APIError as e:
      logger.error("Error generating batch embeddings", error=str(e))
      return [self._get_zero_embedding() for _ in texts]

  def get_embedding_dimension(self) -> int:
    return settings.EMBEDDING_DIMENSION

  def text_to_vector(self, text: str) -> Vector:
    return Vector(self.generate_embedding(text))


embedding_service = EmbeddingService()
