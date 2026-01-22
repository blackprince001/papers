from datetime import datetime, timedelta
from pathlib import Path
from typing import cast

import httpx
from google.genai import types

from app.core.config import settings
from app.core.logger import get_logger
from app.models.paper import Paper
from app.services.base_ai_service import BaseGoogleAIService

logger = get_logger(__name__)

# Domains known to have publicly accessible PDFs
PUBLIC_PDF_DOMAINS = [
  "arxiv.org",
  "export.arxiv.org",
  "biorxiv.org",
  "medrxiv.org",
  "pmc.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "europepmc.org",
  "hal.science",
  "hal.archives-ouvertes.fr",
  "openreview.net",
  "proceedings.mlr.press",
  "jmlr.org",
  "aclanthology.org",
]


def _is_known_public_domain(url: str) -> bool:
  """Check if URL is from a known publicly accessible domain."""
  url_lower = url.lower()
  return any(domain in url_lower for domain in PUBLIC_PDF_DOMAINS)


def _is_pdf_url(url: str) -> bool:
  """Check if URL appears to be a direct PDF link."""
  return url.lower().endswith(".pdf") or "/pdf/" in url.lower()


class ContentProvider(BaseGoogleAIService):
  """Provides content parts for Gemini AI API calls with file URI caching."""

  # Cache TTL for uploaded file URIs (Gemini files expire after 48 hours)
  _CACHE_TTL = timedelta(hours=1)

  def __init__(self) -> None:
    super().__init__()
    self._http_client: httpx.AsyncClient | None = None
    # Cache: paper_id -> (uri, cached_at)
    self._file_uri_cache: dict[int, tuple[str, datetime]] = {}

  def _get_cached_uri(self, paper_id: int) -> str | None:
    """Get cached file URI if still valid."""
    if paper_id in self._file_uri_cache:
      uri, cached_at = self._file_uri_cache[paper_id]
      if datetime.now() - cached_at < self._CACHE_TTL:
        logger.debug("Using cached file URI", paper_id=paper_id)
        return uri
      # Cache expired, remove it
      del self._file_uri_cache[paper_id]
    return None

  def _cache_uri(self, paper_id: int, uri: str) -> None:
    """Cache a file URI for a paper."""
    self._file_uri_cache[paper_id] = (uri, datetime.now())

  def clear_cache(self, paper_id: int | None = None) -> None:
    """Clear the file URI cache.

    Args:
        paper_id: If provided, only clear cache for this paper. Otherwise clear all.
    """
    if paper_id is not None:
      self._file_uri_cache.pop(paper_id, None)
    else:
      self._file_uri_cache.clear()

  async def _get_http_client(self) -> httpx.AsyncClient:
    """Get or create HTTP client for URL checks."""
    if self._http_client is None:
      self._http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)
    return self._http_client

  async def _is_url_accessible(self, url: str) -> bool:
    """Check if a URL is publicly accessible via HEAD request."""
    try:
      client = await self._get_http_client()
      response = await client.head(url)
      is_ok = response.status_code == 200
      is_pdf = "application/pdf" in response.headers.get("content-type", "").lower()
      return is_ok and is_pdf
    except Exception as e:
      logger.debug("URL accessibility check failed", url=url, error=str(e))
      return False

  async def _should_use_url(self, url: str | None) -> bool:
    """Determine if the paper URL can be used directly with Gemini."""
    if not url:
      return False

    # Fast path: known public domains with PDF URLs
    if _is_known_public_domain(url) and _is_pdf_url(url):
      return True

    # Slow path: verify URL is accessible
    return await self._is_url_accessible(url)

  def _get_local_file_path(self, paper: Paper) -> Path | None:
    """Get the full path to the local PDF file."""
    if not paper.file_path:
      return None

    storage_path = Path(settings.STORAGE_PATH)
    file_path = storage_path / paper.file_path

    if file_path.exists():
      return cast(Path, file_path)

    return None

  async def _upload_to_gemini(self, file_path: Path) -> str | None:
    """Upload a local file to Gemini and return the file URI."""
    client = self._get_client()
    if not client:
      return None

    try:
      # Upload file to Gemini Files API
      uploaded_file = client.files.upload(file=file_path)
      logger.info(
        "Uploaded file to Gemini",
        file_path=str(file_path),
        uri=uploaded_file.uri,
      )
      return uploaded_file.uri
    except Exception as e:
      logger.error(
        "Failed to upload file to Gemini",
        file_path=str(file_path),
        error=str(e),
      )
      return None

  async def get_content_parts(
    self,
    paper: Paper,
    include_text_fallback: bool = True,
  ) -> list[types.Part]:
    """Get content parts for the paper using the best available source.

    Priority order:
    1. Cached file URI (if still valid)
    2. Public URL (if accessible)
    3. Local file uploaded to Gemini Files API (cached for future use)
    4. Text content fallback (if enabled)

    Args:
        paper: The paper to get content for
        include_text_fallback: Whether to include text content as fallback

    Returns:
        List of content parts for Gemini API
    """
    paper_id = cast(int, paper.id)

    # Priority 1: Check cache for previously uploaded file URI
    cached_uri = self._get_cached_uri(paper_id)
    if cached_uri:
      logger.info("Using cached file URI for AI context", paper_id=paper_id)
      return [types.Part.from_uri(file_uri=cached_uri)]

    # Priority 2: Try public URL
    if await self._should_use_url(cast(str, paper.url)):
      logger.info("Using public URL for AI context", paper_id=paper_id, url=paper.url)
      return [types.Part.from_uri(file_uri=cast(str, paper.url))]

    # Priority 3: Upload local file (and cache the URI)
    local_path = self._get_local_file_path(paper)
    if local_path:
      uri = await self._upload_to_gemini(local_path)
      if uri:
        # Cache the URI for future requests
        self._cache_uri(paper_id, uri)
        logger.info(
          "Using uploaded file for AI context (cached)",
          paper_id=paper_id,
          uri=uri,
        )
        return [types.Part.from_uri(file_uri=uri)]

    # Priority 4: Text content fallback
    if include_text_fallback and paper.content_text:
      logger.info("Using text content fallback for AI context", paper_id=paper_id)
      return [types.Part.from_text(text=cast(str, paper.content_text))]

    logger.warning("No content available for AI context", paper_id=paper_id)
    return []

  async def close(self) -> None:
    """Clean up resources."""
    if self._http_client:
      await self._http_client.aclose()
      self._http_client = None


# Singleton instance
content_provider = ContentProvider()
