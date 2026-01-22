import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

from app.core.logger import get_logger

logger = get_logger(__name__)

# Default retry settings
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0  # seconds
DEFAULT_RETRY_MULTIPLIER = 2.0


@dataclass
class ExternalPaperResult:
  """Unified result from any discovery provider."""

  source: str
  external_id: str
  title: str
  authors: List[str] = field(default_factory=list)
  abstract: Optional[str] = None
  year: Optional[int] = None
  doi: Optional[str] = None
  arxiv_id: Optional[str] = None
  url: Optional[str] = None
  pdf_url: Optional[str] = None
  citation_count: Optional[int] = None
  metadata: Dict[str, Any] = field(default_factory=dict)
  relevance_score: Optional[float] = None


@dataclass
class SearchFilters:
  """Common search filters across providers."""

  year_from: Optional[int] = None
  year_to: Optional[int] = None
  authors: Optional[List[str]] = None
  min_citations: Optional[int] = None


class BaseDiscoveryProvider(ABC):
  """Abstract base class for discovery data providers."""

  name: str = "base"
  display_name: str = "Base Provider"
  description: str = "Base discovery provider"
  base_url: str = ""

  # Capability flags
  supports_search: bool = True
  supports_citations: bool = False
  supports_recommendations: bool = False

  # Rate limiting
  requests_per_second: float = 1.0

  def __init__(self, api_key: Optional[str] = None) -> None:
    self.api_key = api_key
    self._client: Optional[httpx.AsyncClient] = None

  async def _get_client(self) -> httpx.AsyncClient:
    """Get or create HTTP client."""
    if self._client is None or self._client.is_closed:
      headers = self._get_headers()
      self._client = httpx.AsyncClient(
        headers=headers,
        timeout=30.0,
        follow_redirects=True,
      )
    return self._client

  async def close(self) -> None:
    """Close HTTP client."""
    if self._client and not self._client.is_closed:
      await self._client.aclose()

  def _get_headers(self) -> Dict[str, str]:
    """Get headers for API requests. Override in subclasses."""
    return {}

  async def _get(
    self,
    endpoint: str,
    params: Optional[Dict[str, Any]] = None,
    max_retries: int = DEFAULT_MAX_RETRIES,
  ) -> Dict[str, Any]:
    """Make GET request to provider API with retry logic for rate limiting.

    Args:
        endpoint: API endpoint or full URL
        params: Query parameters
        max_retries: Maximum number of retries for rate limit errors

    Returns:
        JSON response as dict
    """
    client = await self._get_client()
    url = f"{self.base_url}/{endpoint}" if not endpoint.startswith("http") else endpoint

    retry_delay = DEFAULT_RETRY_DELAY

    for attempt in range(max_retries + 1):
      try:
        response = await client.get(url, params=params)

        if response.status_code == 404:
          return {}

        # Handle rate limiting with retry
        if response.status_code == 429:
          if attempt < max_retries:
            # Check for Retry-After header
            retry_after = response.headers.get("Retry-After")
            if retry_after:
              try:
                wait_time = float(retry_after)
              except ValueError:
                wait_time = retry_delay
            else:
              wait_time = retry_delay

            logger.warning(
              "Rate limited, retrying",
              provider=self.name,
              attempt=attempt + 1,
              wait_time=wait_time,
            )
            await asyncio.sleep(wait_time)
            retry_delay *= DEFAULT_RETRY_MULTIPLIER
            continue
          else:
            logger.error(
              "Rate limit exceeded after retries",
              provider=self.name,
              max_retries=max_retries,
            )
            response.raise_for_status()

        response.raise_for_status()
        return response.json()

      except httpx.HTTPStatusError as e:
        if e.response.status_code != 429:
          logger.error(
            "HTTP error from provider",
            provider=self.name,
            status_code=e.response.status_code,
            url=url,
          )
        raise
      except Exception as e:
        logger.error(
          "Error fetching from provider",
          provider=self.name,
          error=str(e),
          url=url,
        )
        raise

    return {}

  @abstractmethod
  async def search(
    self,
    query: str,
    filters: Optional[SearchFilters] = None,
    limit: int = 20,
  ) -> List[ExternalPaperResult]:
    """Search for papers matching the query.

    Args:
        query: Search query string
        filters: Optional search filters
        limit: Maximum number of results

    Returns:
        List of paper results
    """
    pass

  @abstractmethod
  async def get_paper_details(
    self,
    external_id: str,
  ) -> Optional[ExternalPaperResult]:
    """Get detailed information about a specific paper.

    Args:
        external_id: Provider-specific paper ID

    Returns:
        Paper details or None if not found
    """
    pass

  async def get_citations(
    self,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get papers that cite this paper.

    Args:
        external_id: Provider-specific paper ID
        limit: Maximum number of results

    Returns:
        List of citing papers
    """
    if not self.supports_citations:
      return []
    raise NotImplementedError(f"{self.name} does not implement get_citations")

  async def get_references(
    self,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get papers that this paper references.

    Args:
        external_id: Provider-specific paper ID
        limit: Maximum number of results

    Returns:
        List of referenced papers
    """
    if not self.supports_citations:
      return []
    raise NotImplementedError(f"{self.name} does not implement get_references")

  async def get_recommendations(
    self,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get recommended papers similar to this paper.

    Args:
        external_id: Provider-specific paper ID
        limit: Maximum number of results

    Returns:
        List of recommended papers
    """
    if not self.supports_recommendations:
      return []
    raise NotImplementedError(f"{self.name} does not implement get_recommendations")

  def get_source_info(self) -> Dict[str, Any]:
    """Get information about this source."""
    return {
      "name": self.name,
      "display_name": self.display_name,
      "description": self.description,
      "supports_search": self.supports_search,
      "supports_citations": self.supports_citations,
      "supports_recommendations": self.supports_recommendations,
      "rate_limit": f"{self.requests_per_second} req/s",
    }
