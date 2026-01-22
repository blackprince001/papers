from typing import Any, Dict, List, Optional

from app.core.logger import get_logger
from app.services.discovery.base_provider import (
  BaseDiscoveryProvider,
  ExternalPaperResult,
  SearchFilters,
)

logger = get_logger(__name__)


class SemanticScholarProvider(BaseDiscoveryProvider):
  """Discovery provider for Semantic Scholar."""

  name = "semantic_scholar"
  display_name = "Semantic Scholar"
  description = "AI-powered research tool for scientific literature"
  base_url = "https://api.semanticscholar.org/graph/v1"

  supports_search = True
  supports_citations = True
  supports_recommendations = True

  # Semantic Scholar rate limits
  requests_per_second = 10.0  # 100 requests per 5 minutes without API key

  # Fields to request from the API
  PAPER_FIELDS = (
    "paperId,externalIds,title,abstract,year,authors,citationCount,url,openAccessPdf"
  )
  CITATION_FIELDS = "paperId,externalIds,title,year,authors,citationCount,url"

  def _get_headers(self) -> Dict[str, str]:
    """Get headers including API key if available."""
    headers = {}
    if self.api_key:
      headers["x-api-key"] = self.api_key
    return headers

  async def search(
    self,
    query: str,
    filters: Optional[SearchFilters] = None,
    limit: int = 20,
  ) -> List[ExternalPaperResult]:
    """Search Semantic Scholar for papers.

    Args:
        query: Search query
        filters: Optional filters
        limit: Maximum results

    Returns:
        List of paper results
    """
    params: Dict[str, Any] = {
      "query": query,
      "fields": self.PAPER_FIELDS,
      "limit": min(limit, 100),  # API max is 100
    }

    # Apply year filter if specified
    if filters:
      if filters.year_from and filters.year_to:
        params["year"] = f"{filters.year_from}-{filters.year_to}"
      elif filters.year_from:
        params["year"] = f"{filters.year_from}-"
      elif filters.year_to:
        params["year"] = f"-{filters.year_to}"

      if filters.min_citations:
        params["minCitationCount"] = filters.min_citations

    try:
      data = await self._get("paper/search", params)
      papers = data.get("data", [])
      return [self._format_paper(p) for p in papers if p]

    except Exception as e:
      logger.error("Error searching Semantic Scholar", error=str(e), query=query)
      return []

  async def get_paper_details(
    self,
    external_id: str,
  ) -> Optional[ExternalPaperResult]:
    """Get details for a specific paper.

    Args:
        external_id: Semantic Scholar paper ID or DOI

    Returns:
        Paper details or None
    """
    # Format the identifier
    identifier = self._format_identifier(external_id)

    params = {"fields": self.PAPER_FIELDS}

    try:
      data = await self._get(f"paper/{identifier}", params)
      if data:
        return self._format_paper(data)
      return None

    except Exception as e:
      logger.error(
        "Error fetching paper from Semantic Scholar",
        error=str(e),
        external_id=external_id,
      )
      return None

  async def get_citations(
    self,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get papers that cite this paper.

    Args:
        external_id: Semantic Scholar paper ID or DOI
        limit: Maximum results

    Returns:
        List of citing papers
    """
    identifier = self._format_identifier(external_id)
    params = {
      "fields": self.CITATION_FIELDS,
      "limit": min(limit, 100),
    }

    try:
      data = await self._get(f"paper/{identifier}/citations", params)
      results = []
      for item in data.get("data", []):
        citing_paper = item.get("citingPaper")
        if citing_paper:
          results.append(self._format_paper(citing_paper))
      return results

    except Exception as e:
      logger.error(
        "Error fetching citations",
        error=str(e),
        external_id=external_id,
      )
      return []

  async def get_references(
    self,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get papers that this paper references.

    Args:
        external_id: Semantic Scholar paper ID or DOI
        limit: Maximum results

    Returns:
        List of referenced papers
    """
    identifier = self._format_identifier(external_id)
    params = {
      "fields": self.CITATION_FIELDS,
      "limit": min(limit, 100),
    }

    try:
      data = await self._get(f"paper/{identifier}/references", params)
      results = []
      for item in data.get("data", []):
        cited_paper = item.get("citedPaper")
        if cited_paper:
          results.append(self._format_paper(cited_paper))
      return results

    except Exception as e:
      logger.error(
        "Error fetching references",
        error=str(e),
        external_id=external_id,
      )
      return []

  async def get_recommendations(
    self,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get recommended papers similar to this paper.

    Args:
        external_id: Semantic Scholar paper ID
        limit: Maximum results

    Returns:
        List of recommended papers
    """
    # Recommendations API uses a different base
    # and requires the raw paper ID (not DOI format)
    params = {
      "fields": self.CITATION_FIELDS,
      "limit": min(limit, 100),
    }

    try:
      # Use the recommendations endpoint
      client = await self._get_client()
      url = f"https://api.semanticscholar.org/recommendations/v1/papers/forpaper/{external_id}"
      response = await client.get(url, params=params)

      if response.status_code == 404:
        return []

      response.raise_for_status()
      data = response.json()

      papers = data.get("recommendedPapers", [])
      return [self._format_paper(p) for p in papers if p]

    except Exception as e:
      logger.error(
        "Error fetching recommendations",
        error=str(e),
        external_id=external_id,
      )
      return []

  def _format_identifier(self, external_id: str) -> str:
    """Format an identifier for API calls.

    Args:
        external_id: Raw identifier (paper ID, DOI, or arXiv ID)

    Returns:
        Formatted identifier for API
    """
    # If it looks like a DOI, format it
    if external_id.startswith("10."):
      return f"DOI:{external_id}"

    # If it looks like an arXiv ID
    if external_id.startswith("arxiv:"):
      return f"ARXIV:{external_id[6:]}"
    if external_id.replace(".", "").replace("v", "").isdigit():
      # Might be an arXiv ID like "2301.00001"
      return f"ARXIV:{external_id}"

    # Otherwise assume it's a Semantic Scholar paper ID
    return external_id

  def _format_paper(self, paper: Dict[str, Any]) -> ExternalPaperResult:
    """Format a paper from API response to ExternalPaperResult.

    Args:
        paper: Raw paper data from API

    Returns:
        Formatted paper result
    """
    # Extract external IDs
    external_ids = paper.get("externalIds", {}) or {}
    doi = external_ids.get("DOI")
    arxiv_id = external_ids.get("ArXiv")

    # Extract authors
    authors = []
    for author in paper.get("authors", []) or []:
      if author and author.get("name"):
        authors.append(author["name"])

    # Extract PDF URL
    pdf_url = None
    open_access_pdf = paper.get("openAccessPdf")
    if open_access_pdf and open_access_pdf.get("url"):
      pdf_url = open_access_pdf["url"]

    return ExternalPaperResult(
      source=self.name,
      external_id=paper.get("paperId", ""),
      title=paper.get("title", ""),
      authors=authors,
      abstract=paper.get("abstract"),
      year=paper.get("year"),
      doi=doi,
      arxiv_id=arxiv_id,
      url=paper.get("url"),
      pdf_url=pdf_url,
      citation_count=paper.get("citationCount"),
      metadata={
        "semantic_scholar_id": paper.get("paperId"),
      },
    )
