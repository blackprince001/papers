import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.models.discovery import DiscoveredPaper
from app.services.discovery.base_provider import (
  ExternalPaperResult,
  SearchFilters,
)
from app.services.discovery.provider_registry import provider_registry

logger = get_logger(__name__)


class DiscoveryService:
  """Orchestrates discovery searches across multiple providers."""

  async def search(
    self,
    session: AsyncSession,
    query: str,
    sources: List[str],
    filters: Optional[SearchFilters] = None,
    limit: int = 20,
    cache_results: bool = True,
  ) -> Dict[str, Any]:
    """Search across multiple sources in parallel.

    Args:
        session: Database session
        query: Search query
        sources: List of source names to search
        filters: Optional search filters
        limit: Maximum results per source
        cache_results: Whether to cache results in database

    Returns:
        Dict with results by source and summary
    """
    # Get providers for requested sources
    providers = provider_registry.get_by_names(sources)

    if not providers:
      logger.warning("No valid providers found", requested_sources=sources)
      return {
        "query": query,
        "sources_searched": [],
        "results": [],
        "total_results": 0,
        "deduplicated_count": 0,
      }

    # Search all providers in parallel
    search_tasks = [
      self._search_provider(provider, query, filters, limit) for provider in providers
    ]

    results = await asyncio.gather(*search_tasks, return_exceptions=True)

    # Process results
    source_results = []
    all_papers: List[ExternalPaperResult] = []

    for provider, result in zip(providers, results, strict=False):
      if isinstance(result, Exception):
        logger.error(
          "Provider search failed",
          provider=provider.name,
          error=str(result),
        )
        source_results.append(
          {
            "source": provider.name,
            "papers": [],
            "total_available": None,
            "error": str(result),
          }
        )
      else:
        papers, total = result
        source_results.append(
          {
            "source": provider.name,
            "papers": [self._paper_to_dict(p) for p in papers],
            "total_available": total,
            "error": None,
          }
        )
        all_papers.extend(papers)

    # Deduplicate papers across sources
    unique_papers, duplicate_count = self._deduplicate_papers(all_papers)

    # Cache results in database
    if cache_results and unique_papers:
      await self._cache_papers(session, unique_papers)

    return {
      "query": query,
      "sources_searched": [p.name for p in providers],
      "results": source_results,
      "total_results": len(all_papers),
      "deduplicated_count": duplicate_count,
    }

  async def _search_provider(
    self,
    provider,
    query: str,
    filters: Optional[SearchFilters],
    limit: int,
  ) -> Tuple[List[ExternalPaperResult], Optional[int]]:
    """Search a single provider.

    Args:
        provider: Provider instance
        query: Search query
        filters: Search filters
        limit: Max results

    Returns:
        Tuple of (papers, total_available)
    """
    papers = await provider.search(query, filters, limit)
    return papers, None  # Most APIs don't return total count

  async def search_source(
    self,
    session: AsyncSession,
    source: str,
    query: str,
    filters: Optional[SearchFilters] = None,
    limit: int = 20,
    cache_results: bool = True,
  ) -> Dict[str, Any]:
    """Search a single source.

    Args:
        session: Database session
        source: Source name to search
        query: Search query
        filters: Optional search filters
        limit: Maximum results
        cache_results: Whether to cache results in database

    Returns:
        Dict with papers and metadata
    """
    provider = provider_registry.get(source)

    if not provider:
      logger.warning("Provider not found", source=source)
      return {
        "source": source,
        "papers": [],
        "total_available": None,
        "error": f"Unknown source: {source}",
      }

    try:
      papers, total = await self._search_provider(provider, query, filters, limit)

      # Cache results
      if cache_results and papers:
        await self._cache_papers(session, papers)

      return {
        "source": source,
        "papers": [self._paper_to_dict(p) for p in papers],
        "total_available": total,
        "error": None,
      }
    except Exception as e:
      logger.error("Source search failed", source=source, error=str(e))
      return {
        "source": source,
        "papers": [],
        "total_available": None,
        "error": str(e),
      }

  def _deduplicate_papers(
    self,
    papers: List[ExternalPaperResult],
  ) -> Tuple[List[ExternalPaperResult], int]:
    """Deduplicate papers from multiple sources.

    Uses DOI as primary key, falls back to title similarity.

    Args:
        papers: List of papers from all sources

    Returns:
        Tuple of (unique_papers, duplicate_count)
    """
    seen_dois: Dict[str, ExternalPaperResult] = {}
    seen_titles: Dict[str, ExternalPaperResult] = {}
    unique_papers: List[ExternalPaperResult] = []
    duplicate_count = 0

    for paper in papers:
      # Check DOI first
      if paper.doi:
        normalized_doi = paper.doi.lower().strip()
        if normalized_doi in seen_dois:
          duplicate_count += 1
          continue
        seen_dois[normalized_doi] = paper

      # Check title similarity
      normalized_title = self._normalize_title(paper.title)
      if normalized_title in seen_titles:
        duplicate_count += 1
        continue
      seen_titles[normalized_title] = paper

      unique_papers.append(paper)

    return unique_papers, duplicate_count

  def _normalize_title(self, title: str) -> str:
    """Normalize title for deduplication.

    Args:
        title: Raw title

    Returns:
        Normalized title (lowercase, no punctuation, no extra spaces)
    """
    import re

    # Lowercase and remove punctuation
    normalized = title.lower()
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = " ".join(normalized.split())
    return normalized

  async def _cache_papers(
    self,
    session: AsyncSession,
    papers: List[ExternalPaperResult],
  ) -> None:
    """Cache discovered papers in database.

    Args:
        session: Database session
        papers: Papers to cache
    """
    for paper in papers:
      try:
        # Check if paper already exists
        stmt = select(DiscoveredPaper).where(
          DiscoveredPaper.source == paper.source,
          DiscoveredPaper.external_id == paper.external_id,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()

        if existing:
          # Update last fetched time
          existing.last_fetched_at = datetime.now(timezone.utc)
        else:
          # Create new record
          db_paper = DiscoveredPaper(
            source=paper.source,
            external_id=paper.external_id,
            title=paper.title,
            authors=paper.authors,
            abstract=paper.abstract,
            year=paper.year,
            doi=paper.doi,
            arxiv_id=paper.arxiv_id,
            url=paper.url,
            pdf_url=paper.pdf_url,
            citation_count=paper.citation_count,
            metadata_json=paper.metadata,
          )
          session.add(db_paper)

      except Exception as e:
        logger.error(
          "Error caching paper",
          error=str(e),
          paper_title=paper.title,
        )

    await session.commit()

  async def get_paper_by_id(
    self,
    session: AsyncSession,
    discovered_paper_id: int,
  ) -> Optional[DiscoveredPaper]:
    """Get a discovered paper by ID.

    Args:
        session: Database session
        discovered_paper_id: Paper ID

    Returns:
        DiscoveredPaper or None
    """
    stmt = select(DiscoveredPaper).where(DiscoveredPaper.id == discovered_paper_id)
    return (await session.execute(stmt)).scalar_one_or_none()

  async def get_paper_details(
    self,
    session: AsyncSession,
    source: str,
    external_id: str,
  ) -> Optional[ExternalPaperResult]:
    """Get paper details from provider or cache.

    Args:
        session: Database session
        source: Source name
        external_id: External paper ID

    Returns:
        Paper details or None
    """
    # Check cache first
    stmt = select(DiscoveredPaper).where(
      DiscoveredPaper.source == source,
      DiscoveredPaper.external_id == external_id,
    )
    cached = (await session.execute(stmt)).scalar_one_or_none()

    if cached:
      return ExternalPaperResult(
        source=cast(str, cached.source),
        external_id=cast(str, cached.external_id),
        title=cast(str, cached.title),
        authors=cast(list[str], cached.authors) or [],
        abstract=cast(str, cached.abstract),
        year=cast(int, cached.year),
        doi=cast(str, cached.doi),
        arxiv_id=cast(str, cached.arxiv_id),
        url=cast(str, cached.url),
        pdf_url=cast(str, cached.pdf_url),
        citation_count=cast(int, cached.citation_count),
        metadata=cast(dict[str, Any], cached.metadata_json) or {},
      )

    # Fetch from provider
    provider = provider_registry.get(source)
    if not provider:
      return None

    paper = await provider.get_paper_details(external_id)

    # Cache the result
    if paper:
      await self._cache_papers(session, [paper])

    return paper

  async def get_citations(
    self,
    session: AsyncSession,
    source: str,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get papers citing a specific paper.

    Args:
        session: Database session
        source: Source name
        external_id: External paper ID
        limit: Max results

    Returns:
        List of citing papers
    """
    provider = provider_registry.get(source)
    if not provider or not provider.supports_citations:
      return []

    papers = await provider.get_citations(external_id, limit)

    # Cache results
    if papers:
      await self._cache_papers(session, papers)

    return papers

  async def get_references(
    self,
    session: AsyncSession,
    source: str,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get papers referenced by a specific paper.

    Args:
        session: Database session
        source: Source name
        external_id: External paper ID
        limit: Max results

    Returns:
        List of referenced papers
    """
    provider = provider_registry.get(source)
    if not provider or not provider.supports_citations:
      return []

    papers = await provider.get_references(external_id, limit)

    # Cache results
    if papers:
      await self._cache_papers(session, papers)

    return papers

  async def get_recommendations(
    self,
    session: AsyncSession,
    source: str,
    external_id: str,
    limit: int = 10,
  ) -> List[ExternalPaperResult]:
    """Get recommended papers similar to a specific paper.

    Args:
        session: Database session
        source: Source name
        external_id: External paper ID
        limit: Max results

    Returns:
        List of recommended papers
    """
    provider = provider_registry.get(source)
    if not provider or not provider.supports_recommendations:
      return []

    papers = await provider.get_recommendations(external_id, limit)

    # Cache results
    if papers:
      await self._cache_papers(session, papers)

    return papers

  def _paper_to_dict(self, paper: ExternalPaperResult) -> Dict[str, Any]:
    """Convert ExternalPaperResult to dictionary.

    Args:
        paper: Paper result

    Returns:
        Dictionary representation
    """
    return {
      "source": paper.source,
      "external_id": paper.external_id,
      "title": paper.title,
      "authors": paper.authors,
      "abstract": paper.abstract,
      "year": paper.year,
      "doi": paper.doi,
      "arxiv_id": paper.arxiv_id,
      "url": paper.url,
      "pdf_url": paper.pdf_url,
      "citation_count": paper.citation_count,
      "relevance_score": paper.relevance_score,
    }

  def get_source_infos(self) -> List[Dict[str, Any]]:
    """Get information about all available sources.

    Returns:
        List of source info dicts
    """
    return provider_registry.get_source_infos()


# Initialize providers and service
def init_discovery_service() -> DiscoveryService:
  """Initialize discovery service with providers."""
  from app.services.discovery.arxiv_provider import ArxivProvider
  from app.services.discovery.semantic_scholar_provider import SemanticScholarProvider

  # Register providers
  provider_registry.register(ArxivProvider)
  provider_registry.register(SemanticScholarProvider)

  return DiscoveryService()


# Global service instance
discovery_service = init_discovery_service()
