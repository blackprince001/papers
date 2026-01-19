from typing import Any

import httpx

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
    """Make GET request to Semantic Scholar API."""
    async with httpx.AsyncClient() as client:
      url = f"{self.BASE_URL}/{endpoint}"
      response = await client.get(
        url, params=params, headers=self.headers, timeout=30.0
      )
      if response.status_code == 404:
        return {"data": []}
      response.raise_for_status()
      return response.json()

  def _format_paper(self, paper: dict[str, Any]) -> dict[str, Any]:
    """Format paper data from API response."""
    if not paper:
      return {}

    authors = []
    if paper.get("authors"):
      authors = [author.get("name") for author in paper.get("authors", [])]

    return {
      "title": paper.get("title"),
      "doi": paper.get("externalIds", {}).get("DOI"),
      "arxiv": paper.get("externalIds", {}).get("ArXiv"),
      "url": paper.get("url"),
      "year": paper.get("year"),
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


semantic_scholar_service = SemanticScholarService()
