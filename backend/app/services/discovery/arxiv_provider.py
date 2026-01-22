import re
import xml.etree.ElementTree as ET
from typing import List, Optional, cast
from urllib.parse import quote

import httpx

from app.core.logger import get_logger
from app.services.discovery.base_provider import (
  BaseDiscoveryProvider,
  ExternalPaperResult,
  SearchFilters,
)

logger = get_logger(__name__)


class ArxivProvider(BaseDiscoveryProvider):
  """Discovery provider for arXiv.org papers."""

  name = "arxiv"
  display_name = "arXiv"
  description = (
    "Open-access repository for physics, mathematics, computer science, and more"
  )
  base_url = "https://export.arxiv.org/api"

  supports_search = True
  supports_citations = False
  supports_recommendations = False

  # arXiv rate limit: 1 request per 3 seconds
  requests_per_second = 0.33

  # XML namespaces used in arXiv API responses
  NAMESPACES = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
  }

  async def search(
    self,
    query: str,
    filters: Optional[SearchFilters] = None,
    limit: int = 20,
  ) -> List[ExternalPaperResult]:
    """Search arXiv for papers.

    Args:
        query: Search query
        filters: Optional filters (year range, etc.)
        limit: Maximum results to return

    Returns:
        List of paper results
    """
    # Build search query
    search_query = self._build_search_query(query, filters)

    params = {
      "search_query": search_query,
      "start": 0,
      "max_results": min(limit, 100),  # arXiv max is 100 per request
      "sortBy": "relevance",
      "sortOrder": "descending",
    }

    try:
      client = await self._get_client()
      response = await client.get(
        f"{self.base_url}/query",
        params=params,
      )
      response.raise_for_status()

      return self._parse_atom_feed(response.text)

    except httpx.HTTPStatusError as e:
      logger.error(
        "arXiv API error",
        status_code=e.response.status_code,
        query=query,
      )
      return []
    except Exception as e:
      logger.error("Error searching arXiv", error=str(e), query=query)
      return []

  async def get_paper_details(
    self,
    external_id: str,
  ) -> Optional[ExternalPaperResult]:
    """Get details for a specific arXiv paper.

    Args:
        external_id: arXiv ID (e.g., "2301.00001" or "2301.00001v1")

    Returns:
        Paper details or None
    """
    # Clean the ID (remove version if present for the query)
    clean_id = self._clean_arxiv_id(external_id)

    params = {
      "id_list": clean_id,
      "max_results": 1,
    }

    try:
      client = await self._get_client()
      response = await client.get(
        f"{self.base_url}/query",
        params=params,
      )
      response.raise_for_status()

      results = self._parse_atom_feed(response.text)
      return results[0] if results else None

    except Exception as e:
      logger.error(
        "Error fetching arXiv paper",
        error=str(e),
        arxiv_id=external_id,
      )
      return None

  def _build_search_query(
    self,
    query: str,
    filters: Optional[SearchFilters],
  ) -> str:
    """Build arXiv search query string.

    arXiv uses a specific query syntax:
    - all:term - search all fields
    - ti:term - title
    - au:term - author
    - abs:term - abstract
    - cat:category - category
    """
    # Escape special characters and quote multi-word terms
    escaped_query = quote(query, safe="")

    # Basic search across all fields
    search_parts = [f"all:{escaped_query}"]

    if filters:
      # Note: arXiv doesn't directly support year filtering in the API
      # We'll filter results client-side if needed
      if filters.authors:
        for author in filters.authors:
          search_parts.append(f"au:{quote(author, safe='')}")

    return "+AND+".join(search_parts)

  def _parse_atom_feed(self, xml_text: str) -> List[ExternalPaperResult]:
    """Parse arXiv Atom feed response.

    Args:
        xml_text: Raw XML response

    Returns:
        List of parsed paper results
    """
    results = []

    try:
      root = ET.fromstring(xml_text)

      for entry in root.findall("atom:entry", self.NAMESPACES):
        result = self._parse_entry(entry)
        if result:
          results.append(result)

    except ET.ParseError as e:
      logger.error("Error parsing arXiv XML", error=str(e))

    return results

  def _parse_entry(self, entry: ET.Element) -> Optional[ExternalPaperResult]:
    """Parse a single entry from the Atom feed.

    Args:
        entry: XML element for the entry

    Returns:
        Parsed paper result or None
    """
    try:
      # Extract arXiv ID from the entry ID URL
      entry_id = entry.find("atom:id", self.NAMESPACES)
      if entry_id is None or entry_id.text is None:
        return None

      arxiv_id = self._extract_arxiv_id(entry_id.text)
      if not arxiv_id:
        return None

      # Title
      title_elem = entry.find("atom:title", self.NAMESPACES)
      title = self._clean_text(
        cast(str, title_elem.text) if title_elem is not None else ""
      )
      if not title:
        return None

      # Abstract
      summary_elem = entry.find("atom:summary", self.NAMESPACES)
      abstract = self._clean_text(
        cast(str, summary_elem.text) if summary_elem is not None else ""
      )

      # Authors
      authors = []
      for author_elem in entry.findall("atom:author", self.NAMESPACES):
        name_elem = author_elem.find("atom:name", self.NAMESPACES)
        if name_elem is not None and name_elem.text:
          authors.append(name_elem.text.strip())

      # Publication date (extract year)
      published_elem = entry.find("atom:published", self.NAMESPACES)
      year = None
      if published_elem is not None and published_elem.text:
        year = self._extract_year(published_elem.text)

      # URLs
      url = f"https://arxiv.org/abs/{arxiv_id}"
      pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

      # DOI (if available)
      doi = None
      doi_elem = entry.find("arxiv:doi", self.NAMESPACES)
      if doi_elem is not None and doi_elem.text:
        doi = doi_elem.text.strip()

      # Categories
      categories = []
      for cat_elem in entry.findall("atom:category", self.NAMESPACES):
        term = cat_elem.get("term")
        if term:
          categories.append(term)

      return ExternalPaperResult(
        source=self.name,
        external_id=arxiv_id,
        title=title,
        authors=authors,
        abstract=abstract,
        year=year,
        doi=doi,
        arxiv_id=arxiv_id,
        url=url,
        pdf_url=pdf_url,
        citation_count=None,  # arXiv doesn't provide citation counts
        metadata={
          "categories": categories,
          "primary_category": categories[0] if categories else None,
        },
      )

    except Exception as e:
      logger.error("Error parsing arXiv entry", error=str(e))
      return None

  def _extract_arxiv_id(self, url: str) -> Optional[str]:
    """Extract arXiv ID from URL.

    Args:
        url: URL like "http://arxiv.org/abs/2301.00001v1"

    Returns:
        arXiv ID like "2301.00001v1" or None
    """
    # Pattern matches both old-style (hep-th/9901001) and new-style (2301.00001)
    match = re.search(r"arxiv\.org/abs/(.+)$", url)
    if match:
      return match.group(1)

    # Also try matching just the ID pattern
    match = re.search(r"(\d{4}\.\d{4,5}(?:v\d+)?)", url)
    if match:
      return match.group(1)

    return None

  def _clean_arxiv_id(self, arxiv_id: str) -> str:
    """Clean arXiv ID for API queries.

    Args:
        arxiv_id: Raw arXiv ID

    Returns:
        Cleaned ID suitable for API
    """
    # Remove any URL prefix
    if "arxiv.org" in arxiv_id:
      arxiv_id = self._extract_arxiv_id(arxiv_id) or arxiv_id

    # Remove 'arxiv:' prefix if present
    if arxiv_id.lower().startswith("arxiv:"):
      arxiv_id = arxiv_id[6:]

    return arxiv_id.strip()

  def _clean_text(self, text: str) -> str:
    """Clean text by removing extra whitespace.

    Args:
        text: Raw text

    Returns:
        Cleaned text
    """
    if not text:
      return ""
    # Replace newlines and multiple spaces with single space
    return " ".join(text.split())

  def _extract_year(self, date_str: str) -> Optional[int]:
    """Extract year from ISO date string.

    Args:
        date_str: Date string like "2023-01-15T00:00:00Z"

    Returns:
        Year as integer or None
    """
    try:
      match = re.match(r"(\d{4})", date_str)
      if match:
        return int(match.group(1))
    except (ValueError, AttributeError):
      pass
    return None
