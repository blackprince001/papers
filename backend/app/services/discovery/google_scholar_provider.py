import asyncio
from typing import List, Optional

from serpapi import GoogleSearch

from app.core.config import settings
from app.core.logger import get_logger
from app.services.discovery.base_provider import (
  BaseDiscoveryProvider,
  ExternalPaperResult,
  SearchFilters,
)

logger = get_logger(__name__)


class GoogleScholarProvider(BaseDiscoveryProvider):
  """Discovery provider for Google Scholar using SerpApi."""

  name = "google_scholar"
  display_name = "Google Scholar"
  description = "Search across many disciplines and sources via SerpApi: articles, theses, books, abstracts and court opinions."
  base_url = "https://scholar.google.com"

  # SerpApi handles rate limiting, so we can be faster
  requests_per_second = 2.0

  supports_search = True
  supports_citations = True
  supports_recommendations = True

  async def search(
    self,
    query: str,
    filters: Optional[SearchFilters] = None,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Search Google Scholar via SerpApi."""
    if not settings.SERPAPI_KEY:
      logger.warning("SERPAPI_KEY not set. Google Scholar search skipped.")
      return []

    # Run synchronous API calls in a thread pool
    try:
      loop = asyncio.get_running_loop()
      results = await loop.run_in_executor(
        None, self._sync_search, query, filters, limit
      )
      return results
    except Exception as e:
      logger.error("Google Scholar search failed", error=str(e), query=query)
      return []

  def _sync_search(
    self, query: str, filters: Optional[SearchFilters] = None, limit: int = 10
  ) -> List[ExternalPaperResult]:
    """Synchronous search function to run in executor."""

    # Build search parameters
    params = {
      "engine": "google_scholar",
      "q": query,
      "hl": "en",
      "api_key": settings.SERPAPI_KEY,
      "num": min(limit, 20),  # Max 20 per page usually
    }

    # Apply filters
    if filters:
      if filters.year_from:
        params["as_ylo"] = filters.year_from
      if filters.year_to:
        params["as_yhi"] = filters.year_to
      if filters.authors:
        # Add authors to query
        author_query = " ".join([f'author:"{a}"' for a in filters.authors])
        params["q"] = f" {author_query}"

    try:
      search = GoogleSearch(params)
      results = search.get_dict()

      if "error" in results:
        logger.error("SerpApi error", error=results["error"])
        return []

      organic_results = results.get("organic_results", [])
      papers = []

      for result in organic_results:
        try:
          # Extract authors (often in publication_info)
          pub_info = result.get("publication_info", {})
          authors_str = pub_info.get("summary", "")
          # Simple heuristic extraction if list not provided
          authors = []
          if authors_str:
            authors = [a.strip() for a in authors_str.split("-")[0].split(",")]

          # Year extraction
          year = None
          import re

          year_match = re.search(r"\b(19|20)\d{2}\b", authors_str)
          if year_match:
            year = int(year_match.group(0))

          paper = ExternalPaperResult(
            source=self.name,
            external_id=result.get(
              "result_id", result.get("link", result.get("title"))
            ),
            title=result.get("title"),
            authors=authors,
            abstract=result.get("snippet"),
            year=year,
            url=result.get("link"),
            pdf_url=result.get("resources", [{}])[0].get("link")
            if result.get("resources")
            else None,
            citation_count=result.get("inline_links", {})
            .get("cited_by", {})
            .get("total"),
            relevance_score=0.9,  # SerpApi ranks well
            metadata={
              "result_id": result.get("result_id"),
              "serpapi_link": result.get("serpapi_scholar_link"),
            },
          )
          papers.append(paper)

          if len(papers) >= limit:
            break

        except Exception as e:
          logger.warning("Error parsing SerpApi result", error=str(e))
          continue

      return papers

    except Exception as e:
      logger.error("Error in SerpApi search", error=str(e))
      raise

  async def get_paper_details(
    self,
    external_id: str,
  ) -> Optional[ExternalPaperResult]:
    """Get details via search (since we don't have direct ID lookups efficiently)."""
    # If external_id looks like a URL, we might not be able to search it directly easily.
    # But generally we'll use search for this flow.
    results = await self.search(external_id, limit=1)
    return results[0] if results else None
