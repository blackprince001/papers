import asyncio
from typing import List, Optional

from pgvector.sqlalchemy import Vector
from sentence_transformers import SentenceTransformer

from app.core.config import settings


class EmbeddingService:
  def __init__(self, model_name: Optional[str] = None):
    self.model_name = model_name or settings.EMBEDDING_MODEL
    self._model: Optional[SentenceTransformer] = None

  @property
  def model(self) -> SentenceTransformer:
    if self._model is None:
      self._model = SentenceTransformer(self.model_name)
    return self._model

  def generate_embedding(self, text: str) -> List[float]:
    if not text or not text.strip():
      return [0.0] * self.get_embedding_dimension()

    embedding = self.model.encode(text, normalize_embeddings=True)
    return embedding.tolist()

  async def generate_embedding_async(self, text: str) -> List[float]:
    """Async wrapper for embedding generation."""
    if not text or not text.strip():
      return [0.0] * self.get_embedding_dimension()

    loop = asyncio.get_event_loop()
    embedding = await loop.run_in_executor(
      None, lambda: self.model.encode(text, normalize_embeddings=True)
    )
    return embedding.tolist()

  def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
    if not texts:
      return []

    non_empty_texts = [t for t in texts if t and t.strip()]
    if not non_empty_texts:
      return [[0.0] * self.get_embedding_dimension()] * len(texts)

    embeddings = self.model.encode(non_empty_texts, normalize_embeddings=True)
    return embeddings.tolist()

  def get_embedding_dimension(self) -> int:
    if "384" in self.model_name or "MiniLM" in self.model_name:
      return 384
    return 384

  def text_to_vector(self, text: str) -> Vector:
    embedding = self.generate_embedding(text)
    return Vector(embedding)


embedding_service = EmbeddingService()
