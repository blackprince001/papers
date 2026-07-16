import asyncio
from typing import Any

import httpx

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)


class SemanticScholarService:
  BASE_URL = "https://api.semanticscholar.org/graph/v1"

  def __init__(self, api_key: str | None = None) -> None:
    self.api_key = api_key
    self.headers: dict[str, str] = {}
    if self.api_key:
      self.headers["x-api-key"] = self.api_key

  async def _get(self, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    """GET the Semantic Scholar API, retrying transient 429s with backoff.

    The unauthenticated S2 pool throttles aggressively; without retries a single
    429 silently empties a paper's references. Set ``SEMANTIC_SCHOLAR_API_KEY``
    for a dedicated (much higher) rate limit.
    """
    url = f"{self.BASE_URL}/{endpoint}"
    delay = 1.0
    for attempt in range(4):
      async with httpx.AsyncClient() as client:
        response = await client.get(
          url, params=params, headers=self.headers, timeout=30.0
        )
      if response.status_code == 404:
        return {"data": []}
      if response.status_code == 429 and attempt < 3:
        retry_after = response.headers.get("retry-after", "")
        wait = (
          float(retry_after)
          if retry_after.replace(".", "", 1).isdigit()
          else delay
        )
        logger.warning(
          "Semantic Scholar rate limited (429); backing off",
          endpoint=endpoint,
          attempt=attempt + 1,
          wait=wait,
        )
        await asyncio.sleep(min(wait, 10.0))
        delay *= 2
        continue
      response.raise_for_status()
      return response.json()
    return {"data": []}  # unreachable — the loop returns or raises

  def _format_paper(self, paper: dict[str, Any]) -> dict[str, Any]:
    """Format paper data from API response."""
    if not paper:
      return {}

    authors = []
    if paper.get("authors"):
      authors = [author.get("name") for author in paper.get("authors", [])]

    external_ids = paper.get("externalIds") or {}
    return {
      "s2_id": paper.get("paperId"),
      "title": paper.get("title"),
      "doi": external_ids.get("DOI"),
      "arxiv": external_ids.get("ArXiv"),
      "url": paper.get("url"),
      "year": paper.get("year"),
      "citation_count": paper.get("citationCount"),
      "authors": authors,
    }

  def _get_identifier(
    self, doi: str | None = None, arxiv: str | None = None
  ) -> str | None:
    """Get paper identifier for API calls."""
    if doi:
      if doi.startswith("10."):
        return f"DOI:{doi}"
      return doi

    if arxiv:
      if arxiv.startswith("arxiv:"):
        return f"ARXIV:{arxiv.replace('arxiv:', '')}"
      return f"ARXIV:{arxiv}"

    return None

  NEIGHBOR_FIELDS = "paperId,title,url,year,citationCount,authors,externalIds"

  async def search_paper(self, title: str) -> str | None:
    """Search for a paper by title and return its Semantic Scholar ID."""
    if not title:
      return None

    endpoint = "paper/search"
    params = {"query": title, "fields": "paperId,externalIds", "limit": 1}

    try:
      data = await self._get(endpoint, params)
      if data.get("data"):
        return data["data"][0].get("paperId")
    except Exception as e:
      logger.error("Error searching for paper", title=title, error=str(e))

    return None

  async def resolve_paper_id(
    self,
    *,
    doi: str | None = None,
    arxiv: str | None = None,
    title: str | None = None,
  ) -> str | None:
    """Resolve a paper to its Semantic Scholar id.

    Tries DOI / arXiv identifiers first (exact lookup), then falls back to a
    title search. Returns ``None`` when the paper cannot be found.
    """
    identifier = self._get_identifier(doi=doi, arxiv=arxiv)
    if identifier:
      try:
        data = await self._get(f"paper/{identifier}", {"fields": "paperId"})
        if data.get("paperId"):
          return data["paperId"]
      except Exception as e:
        logger.warning(
          "Error resolving paper by identifier", identifier=identifier, error=str(e)
        )

    if title:
      return await self.search_paper(title)

    return None

  async def get_neighbors(
    self, identifier: str, *, direction: str, limit: int = 200
  ) -> list[dict[str, Any]]:
    """Fetch references or citations for a paper, paged up to ``limit``.

    ``direction`` is ``"references"`` (works the paper cites) or
    ``"citations"`` (works that cite the paper). Returns formatted neighbour
    dicts (see ``_format_paper``), de-duplicated by Semantic Scholar id.
    """
    if not identifier or direction not in ("references", "citations"):
      return []

    inner_key = "citedPaper" if direction == "references" else "citingPaper"
    page_size = 100
    results: dict[str, dict[str, Any]] = {}
    offset = 0

    while offset < limit:
      params = {
        "fields": self.NEIGHBOR_FIELDS,
        "limit": min(page_size, limit - offset),
        "offset": offset,
      }
      try:
        data = await self._get(f"paper/{identifier}/{direction}", params)
      except Exception as e:
        logger.error(
          "Error fetching neighbors",
          identifier=identifier,
          direction=direction,
          error=str(e),
        )
        break

      rows = data.get("data", [])
      if not rows:
        break

      for item in rows:
        inner = item.get(inner_key)
        if not inner or not inner.get("paperId"):
          continue
        formatted = self._format_paper(inner)
        results[inner["paperId"]] = formatted

      if len(rows) < params["limit"]:
        break
      offset += params["limit"]

    return list(results.values())

  async def get_neighbors_page(
    self, identifier: str, *, direction: str, offset: int = 0, limit: int = 25
  ) -> tuple[list[dict[str, Any]], bool]:
    """Fetch a single page of references/citations at ``offset``.

    Returns ``(neighbours, has_more)``. ``has_more`` is true when Semantic
    Scholar reports a ``next`` offset (or the page came back full).
    """
    if not identifier or direction not in ("references", "citations"):
      return [], False

    inner_key = "citedPaper" if direction == "references" else "citingPaper"
    params = {"fields": self.NEIGHBOR_FIELDS, "limit": limit, "offset": offset}
    try:
      data = await self._get(f"paper/{identifier}/{direction}", params)
    except Exception as e:
      logger.error(
        "Error fetching neighbors page",
        identifier=identifier,
        direction=direction,
        error=str(e),
      )
      return [], False

    rows = data.get("data", [])
    results = []
    for item in rows:
      inner = item.get(inner_key)
      if inner and inner.get("paperId"):
        results.append(self._format_paper(inner))

    has_more = data.get("next") is not None or len(rows) == limit
    return results, has_more

  async def get_citations(
    self, identifier: str, limit: int = 10
  ) -> list[dict[str, Any]]:
    """Get papers that cite this paper."""
    if not identifier:
      return []

    endpoint = f"paper/{identifier}/citations"
    params = {"fields": "title,url,year,authors,externalIds", "limit": limit}

    try:
      data = await self._get(endpoint, params)
      results = []
      for item in data.get("data", []):
        citing_paper = item.get("citingPaper")
        if citing_paper:
          results.append(self._format_paper(citing_paper))
      return results

    except Exception as e:
      logger.error("Error fetching citations", identifier=identifier, error=str(e))
      return []

  async def get_references(
    self, identifier: str, limit: int = 10
  ) -> list[dict[str, Any]]:
    """Get papers that this paper references."""
    if not identifier:
      return []

    endpoint = f"paper/{identifier}/references"
    params = {"fields": "title,url,year,authors,externalIds", "limit": limit}

    try:
      data = await self._get(endpoint, params)
      results = []
      for item in data.get("data", []):
        cited_paper = item.get("citedPaper")
        if cited_paper:
          results.append(self._format_paper(cited_paper))
      return results

    except Exception as e:
      logger.error("Error fetching references", identifier=identifier, error=str(e))
      return []

  async def get_recommendations(
    self, identifier: str, limit: int = 10
  ) -> list[dict[str, Any]]:
    """Get recommended papers similar to this paper."""
    if not identifier:
      return []

    endpoint = f"recommendations/papers/{identifier}"
    params = {"fields": "title,url,year,authors,externalIds", "limit": limit}

    try:
      data = await self._get(endpoint, params)
      papers = data.get("recommendedPapers", [])
      return [self._format_paper(p) for p in papers]

    except Exception as e:
      logger.error(
        "Error fetching recommendations", identifier=identifier, error=str(e)
      )
      return []


semantic_scholar_service = SemanticScholarService(
  api_key=settings.SEMANTIC_SCHOLAR_API_KEY
)
