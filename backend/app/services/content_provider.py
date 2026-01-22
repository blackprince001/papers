from datetime import datetime, timedelta
from pathlib import Path
from typing import cast

from google.genai import errors as genai_errors
from google.genai import types

from app.core.config import settings
from app.core.logger import get_logger
from app.models.paper import Paper
from app.services.base_ai_service import BaseGoogleAIService

logger = get_logger(__name__)

CACHE_TTL = timedelta(hours=1)
PDF_MIME_TYPE = "application/pdf"


class ContentProvider(BaseGoogleAIService):
  def __init__(self) -> None:
    super().__init__()
    self._cached_uris: dict[int, tuple[str, datetime]] = {}

  def get_cached_uri(self, paper_id: int) -> str | None:
    if paper_id not in self._cached_uris:
      return None

    uri, cached_at = self._cached_uris[paper_id]
    if datetime.now() - cached_at >= CACHE_TTL:
      del self._cached_uris[paper_id]
      return None

    return uri

  def cache_uri(self, paper_id: int, uri: str) -> None:
    self._cached_uris[paper_id] = (uri, datetime.now())

  def clear_cache(self, paper_id: int | None = None) -> None:
    if paper_id is None:
      self._cached_uris.clear()
      return
    self._cached_uris.pop(paper_id, None)

  def _resolve_absolute_path(self, file_path: Path) -> Path | None:
    if file_path.exists():
      return file_path
    return None

  def _resolve_relative_path(self, file_path: Path) -> Path | None:
    if file_path.exists():
      return file_path

    storage_path = Path(settings.STORAGE_PATH)
    full_path = storage_path / file_path
    if full_path.exists():
      return full_path

    full_path = storage_path / file_path.name
    if full_path.exists():
      return full_path

    return None

  def get_local_file_path(self, paper: Paper) -> Path | None:
    if not paper.file_path:
      return None

    file_path = Path(cast(str, paper.file_path))
    if file_path.is_absolute():
      return self._resolve_absolute_path(file_path)

    return self._resolve_relative_path(file_path)

  async def upload_to_gemini(self, file_path: Path) -> str | None:
    client = self._get_client()
    if not client:
      return None

    try:
      uploaded_file = client.files.upload(file=file_path)
      logger.info(
        "Uploaded file to Gemini", file_path=str(file_path), uri=uploaded_file.uri
      )
      return uploaded_file.uri
    except genai_errors.APIError as e:
      logger.error(
        "Failed to upload file to Gemini", file_path=str(file_path), error=str(e)
      )
      return None

  async def get_content_parts(
    self, paper: Paper, include_text_fallback: bool = True
  ) -> list[types.Part]:
    paper_id = cast(int, paper.id)

    cached_uri = self.get_cached_uri(paper_id)
    if cached_uri:
      return [types.Part.from_uri(file_uri=cached_uri, mime_type=PDF_MIME_TYPE)]

    local_path = self.get_local_file_path(paper)
    if local_path:
      uri = await self.upload_to_gemini(local_path)
      if uri:
        self.cache_uri(paper_id, uri)
        return [types.Part.from_uri(file_uri=uri, mime_type=PDF_MIME_TYPE)]

    if include_text_fallback and paper.content_text:
      return [types.Part.from_text(text=cast(str, paper.content_text))]

    logger.warning("No content available", paper_id=paper_id)
    return []


content_provider = ContentProvider()
