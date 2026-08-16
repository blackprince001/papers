"""Function tools for external discovery.

Includes academic paper discovery (arXiv, Semantic Scholar, Google Scholar)
and general web search (Google via SerpAPI, DuckDuckGo fallback).
All tools use the per-request ``BYOContext`` for database access.
"""

from __future__ import annotations

from typing import Any

try:
  from agents import function_tool
except ImportError:
  def function_tool(*args, **kwargs):  # type: ignore[misc]
    # Support both bare ``@function_tool`` and ``@function_tool(name_override=…)``.
    if args and callable(args[0]):
      return args[0]

    def _wrap(f):
      return f

    return _wrap

from app.core.config import settings
from app.core.logger import get_logger
from app.services.ai.agent.context import get_byo_context
from app.services.ai.agent.tools import with_timeout
from app.services.deep_research.evidence import collect_context_evidence

logger = get_logger(__name__)

VALID_SOURCES = {"arxiv", "semantic_scholar", "google_scholar", "openalex"}


def _collect_dr_sources(items: list[dict[str, Any]]) -> None:
  """Append structured papers to the deep-research citation collector.

  The deep-research run seeds ``dr_sources`` in its ``BYOContext``; tools push
  the papers they surfaced so the run can build a rich, tabbed Citations panel.
  A no-op for chat/discovery agents (no collector present).
  """
  if not items:
    return
  try:
    collect_context_evidence(get_byo_context().extra, items)
  except Exception:  # noqa: BLE001 — telemetry only, never break a tool
    pass


def _format_paper(p, index: int = 0) -> str:
  """Format a single ExternalPaperResult as a readable string."""
  lines = [
    f"{f'{index}. ' if index else ''}[{p.source}/{p.external_id}] {p.title}",
  ]
  if p.authors:
    authors = p.authors[:5]
    author_str = ", ".join(authors)
    if len(p.authors) > 5:
      author_str += f" +{len(p.authors) - 5} more"
    lines.append(f"   Authors: {author_str}")
  if p.year:
    lines.append(f"   Year: {p.year}")
  if p.abstract:
    snippet = p.abstract[:500]
    if len(p.abstract) > 500:
      snippet += "..."
    lines.append(f"   Abstract: {snippet}")
  details = []
  if p.doi:
    details.append(f"DOI: {p.doi}")
  if p.citation_count is not None:
    details.append(f"Citations: {p.citation_count}")
  if p.url:
    details.append(f"URL: {p.url}")
  if details:
    lines.append(f"   {' | '.join(details)}")
  return "\n".join(lines)


@function_tool
@with_timeout()
async def search_discovery(
  query: str,
  sources: str = "arxiv,google_scholar,semantic_scholar",
  limit: int = 10,
  year_from: int | None = None,
  year_to: int | None = None,
) -> str:
  """Search for academic papers across external discovery sources.

  Use this when the user wants to find papers that are not yet in their
  library — for literature reviews, discovering new research, or finding
  papers on a specific topic.

  Args:
      query: The search query (topic, title, keywords).
      sources: Comma-separated source names. Options: arxiv, semantic_scholar, google_scholar.
      limit: Max results per source (default 10, max 50).
      year_from: Optional start year filter.
      year_to: Optional end year filter.

  Returns:
      A formatted list of discovered papers with source, title, authors,
      year, abstract, and citation counts.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from app.services.discovery.base_provider import SearchFilters
    from app.services.discovery.discovery_service import DiscoveryService

    source_list = [s.strip() for s in sources.split(",") if s.strip() in VALID_SOURCES]
    if not source_list:
      return f"Error: No valid sources provided. Valid sources: {', '.join(sorted(VALID_SOURCES))}"

    limit = min(max(1, limit), 50)

    filters = SearchFilters()
    if year_from:
      filters.year_from = year_from
    if year_to:
      filters.year_to = year_to

    service = DiscoveryService()
    result = await service.search(
      session=db,
      query=query,
      sources=source_list,
      filters=filters,
      limit=limit,
      cache_results=False,
    )

    all_papers: list = []
    for sr in result.get("results", []):
      all_papers.extend(sr.get("papers", []))

    if not all_papers:
      return f"No papers found matching '{query}' across {', '.join(source_list)}."

    from app.services.discovery.base_provider import ExternalPaperResult

    lines = [
      f"Found {len(all_papers)} paper(s) for '{query}' across "
      f"{len(source_list)} source(s):\n"
    ]
    collected: list[dict[str, Any]] = []
    for i, p in enumerate(all_papers, 1):
      ext = ExternalPaperResult(**p)
      lines.append(_format_paper(ext, i))
      lines.append("")
      collected.append(
        {
          "type": "academic",
          "source": ext.source,
          "external_id": ext.external_id,
          "title": ext.title,
          "authors": ext.authors,
          "year": ext.year,
          "citation_count": ext.citation_count,
          "url": ext.url,
          "pdf_url": ext.pdf_url,
        }
      )
    _collect_dr_sources(collected)

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error("Error in search_discovery", query=query, error=str(e))
    return f"Error searching discovery sources: {str(e)[:300]}"


@function_tool
@with_timeout()
async def get_paper_details(source: str, external_id: str) -> str:
  """Get detailed information about a specific paper from a discovery source.

  Use this when you need full metadata, abstract, or citation count for
  a specific paper identified by its source and external ID.

  Args:
      source: The source name (arxiv, semantic_scholar, google_scholar).
      external_id: The paper's ID in that source (e.g. arXiv ID, Semantic Scholar ID).

  Returns:
      Detailed paper information including title, authors, abstract, DOI, URL.
  """
  if source not in VALID_SOURCES:
    return f"Error: Invalid source '{source}'. Valid sources: {', '.join(sorted(VALID_SOURCES))}"

  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from app.services.discovery.discovery_service import DiscoveryService

    service = DiscoveryService()
    paper = await service.get_paper_details(
      session=db, source=source, external_id=external_id
    )

    if not paper:
      return f"Paper '{external_id}' not found in {source}."

    return _format_paper(paper)

  except Exception as e:
    logger.error(
      "Error in get_paper_details", source=source, external_id=external_id, error=str(e)
    )
    return f"Error fetching paper details: {str(e)[:300]}"


@function_tool(name_override="discovery_get_citations")
@with_timeout()
async def get_citations(source: str, external_id: str, limit: int = 10) -> str:
  """Get papers that cite a specific paper.

  Use this to find subsequent work that has cited a given paper,
  useful for understanding the impact and follow-up research.

  Args:
      source: The source name (semantic_scholar — arXiv and Google Scholar do not support citations).
      external_id: The paper's ID in that source.
      limit: Max number of citing papers to return (default 10, max 50).

  Returns:
      A formatted list of papers citing the given paper.
  """
  if source not in VALID_SOURCES:
    return f"Error: Invalid source '{source}'."

  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from app.services.discovery.discovery_service import DiscoveryService

    limit = min(max(1, limit), 50)

    service = DiscoveryService()
    papers = await service.get_citations(
      session=db, source=source, external_id=external_id, limit=limit
    )

    if not papers:
      return (
        f"No citing papers found for '{external_id}' in {source}. "
        f"Note: only Semantic Scholar supports citation lookup."
      )

    lines = [f"Found {len(papers)} paper(s) citing '{external_id}':\n"]
    for i, p in enumerate(papers, 1):
      lines.append(_format_paper(p, i))
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error(
      "Error in get_citations", source=source, external_id=external_id, error=str(e)
    )
    return f"Error fetching citations: {str(e)[:300]}"


@function_tool
@with_timeout()
async def get_references(source: str, external_id: str, limit: int = 10) -> str:
  """Get papers referenced by a specific paper (its bibliography).

  Use this to find the sources a paper builds upon, useful for
  understanding the background and related work.

  Args:
      source: The source name (semantic_scholar — arXiv and Google Scholar do not support references).
      external_id: The paper's ID in that source.
      limit: Max number of references to return (default 10, max 50).

  Returns:
      A formatted list of papers referenced by the given paper.
  """
  if source not in VALID_SOURCES:
    return f"Error: Invalid source '{source}'."

  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from app.services.discovery.discovery_service import DiscoveryService

    limit = min(max(1, limit), 50)

    service = DiscoveryService()
    papers = await service.get_references(
      session=db, source=source, external_id=external_id, limit=limit
    )

    if not papers:
      return (
        f"No references found for '{external_id}' in {source}. "
        f"Note: only Semantic Scholar supports reference lookup."
      )

    lines = [f"Found {len(papers)} reference(s) for '{external_id}':\n"]
    for i, p in enumerate(papers, 1):
      lines.append(_format_paper(p, i))
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error(
      "Error in get_references", source=source, external_id=external_id, error=str(e)
    )
    return f"Error fetching references: {str(e)[:300]}"


@function_tool
@with_timeout()
async def get_recommendations(source: str, external_id: str, limit: int = 10) -> str:
  """Get paper recommendations similar to a specific paper.

  Use this to discover related papers you might want to read next,
  based on similarity to a known paper.

  Args:
      source: The source name (semantic_scholar — arXiv and Google Scholar do not support recommendations).
      external_id: The paper's ID in that source.
      limit: Max number of recommendations to return (default 10, max 50).

  Returns:
      A formatted list of recommended papers similar to the given paper.
  """
  if source not in VALID_SOURCES:
    return f"Error: Invalid source '{source}'."

  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from app.services.discovery.discovery_service import DiscoveryService

    limit = min(max(1, limit), 50)

    service = DiscoveryService()
    papers = await service.get_recommendations(
      session=db, source=source, external_id=external_id, limit=limit
    )

    if not papers:
      return (
        f"No recommendations found for '{external_id}' in {source}. "
        f"Note: only Semantic Scholar supports recommendations."
      )

    lines = [f"Found {len(papers)} recommendation(s) based on '{external_id}':\n"]
    for i, p in enumerate(papers, 1):
      lines.append(_format_paper(p, i))
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error(
      "Error in get_recommendations",
      source=source,
      external_id=external_id,
      error=str(e),
    )
    return f"Error fetching recommendations: {str(e)[:300]}"


async def _openalex_search(query: str, limit: int) -> list[dict]:
  """Search OpenAlex for scholarly works."""
  import httpx

  params: dict[str, str | int] = {
    "search": query,
    "per_page": min(limit, 25),
    "sort": "relevance_score:desc",
    "select": "id,title,authorships,publication_year,doi,cited_by_count,abstract_inverted_index,primary_location",
  }
  if settings.OPENALEX_API_KEY:
    params["api_key"] = settings.OPENALEX_API_KEY

  async with httpx.AsyncClient(timeout=15.0) as client:
    resp = await client.get("https://api.openalex.org/works", params=params)
    resp.raise_for_status()
    data = resp.json()

  results: list[dict] = []
  for work in data.get("results", []):
    authors = []
    for a in work.get("authorships") or []:
      author_data = a.get("author") or {}
      if author_data.get("display_name"):
        authors.append(author_data["display_name"])

    abstract = _reconstruct_abstract(work.get("abstract_inverted_index"))

    doi = work.get("doi", "")
    if doi:
      doi = doi.replace("https://doi.org/", "")

    loc = work.get("primary_location") or {}
    url = loc.get("landing_page_url") or (f"https://doi.org/{doi}" if doi else None)

    results.append(
      {
        "title": work.get("title", ""),
        "authors": ", ".join(authors[:5]),
        "year": work.get("publication_year"),
        "snippet": (abstract or "")[:300],
        "url": url or "",
        "doi": doi,
        "citations": work.get("cited_by_count"),
      }
    )

  return results


@function_tool
@with_timeout()
async def web_search(query: str, limit: int = 5) -> str:
  """Search the web for scholarly papers and research via OpenAlex.

  Use this to find academic papers, research articles, and scholarly
  works on any topic across all disciplines. OpenAlex indexes over
  250 million works from all fields of study — not just CS/ML.

  This is good for:
  - Finding papers on a specific topic
  - Getting recent research in any field
  - Understanding who published what and when
  - Discovering papers with citation counts

  Args:
      query: The search query (topic, title, keywords).
      limit: Max results (default 5, max 25).

  Returns:
      A formatted list of scholarly works with title, authors,
      year, abstract snippet, and citation counts.
  """
  limit = min(max(1, limit), 25)

  try:
    results = await _openalex_search(query, limit)

    if not results:
      return f"No scholarly works found for '{query}'."

    _collect_dr_sources(
      [
        {
          "type": "web",
          "source": "openalex",
          "external_id": r.get("id"),
          "title": r.get("title"),
          "authors": r.get("authors"),
          "year": r.get("year"),
          "citation_count": r.get("citations"),
          "url": r.get("url"),
        }
        for r in results
      ]
    )

    lines = [f"Scholarly results for '{query}':\n"]
    for i, r in enumerate(results, 1):
      lines.append(f"{i}. {r['title']}")
      if r.get("authors"):
        lines.append(f"   Authors: {r['authors']}")
      parts = []
      if r.get("year"):
        parts.append(f"Year: {r['year']}")
      if r.get("citations") is not None:
        parts.append(f"Citations: {r['citations']}")
      if r.get("doi"):
        parts.append(f"DOI: {r['doi']}")
      if parts:
        lines.append(f"   {' | '.join(parts)}")
      if r.get("snippet"):
        lines.append(f"   {r['snippet']}")
      if r.get("url"):
        lines.append(f"   URL: {r['url']}")
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error("Error in web_search", query=query, error=str(e))
    return f"Error searching OpenAlex: {str(e)[:300]}"


def _reconstruct_abstract(inverted_index: dict | None) -> str | None:
  """Rebuild abstract string from OpenAlex's inverted index format."""
  if not inverted_index:
    return None
  word_positions: list[tuple[int, str]] = []
  for word, positions in inverted_index.items():
    for pos in positions:
      word_positions.append((pos, word))
  word_positions.sort(key=lambda x: x[0])
  return " ".join(word for _, word in word_positions)


@function_tool
@with_timeout()
async def search_authors(query: str, limit: int = 10) -> str:
  """Search for researcher profiles across all disciplines via OpenAlex.

  Use this to find information about researchers: their names,
  affiliations, h-index, total publications, and citation counts.
  Good for finding experts in a field or learning about an author's
  impact.

  Args:
      query: The author name or topic to search for.
      limit: Max results (default 10, max 25).

  Returns:
      A formatted list of author profiles with name, institution,
      h-index, and publication/citation counts.
  """
  limit = min(max(1, limit), 25)

  try:
    import httpx

    params: dict[str, str | int] = {
      "search": query,
      "per_page": min(limit, 25),
      "sort": "cited_by_count:desc",
    }
    if settings.OPENALEX_API_KEY:
      params["api_key"] = settings.OPENALEX_API_KEY

    async with httpx.AsyncClient(timeout=15.0) as client:
      resp = await client.get("https://api.openalex.org/authors", params=params)
      resp.raise_for_status()
      data = resp.json()

    results = data.get("results", [])
    if not results:
      return f"No authors found matching '{query}'."

    lines = [f"Authors matching '{query}':\n"]
    for i, author in enumerate(results, 1):
      name = author.get("display_name", "Unknown")
      h = author.get("h_index")
      works = author.get("works_count")
      citations = author.get("cited_by_count")
      orcid = author.get("orcid")

      insts = []
      for inst in author.get("last_known_institutions") or []:
        n = inst.get("display_name")
        c = inst.get("country_code")
        if n:
          insts.append(f"{n} ({c})" if c else n)

      lines.append(f"{i}. {name}")
      if insts:
        lines.append(f"   Institution: {insts[0]}")
      stats = []
      if h is not None:
        stats.append(f"h-index: {h}")
      if works is not None:
        stats.append(f"Publications: {works}")
      if citations is not None:
        stats.append(f"Citations: {citations}")
      if stats:
        lines.append(f"   {' | '.join(stats)}")
      if orcid:
        lines.append(f"   ORCID: {orcid}")
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error("Error in search_authors", query=query, error=str(e))
    return f"Error searching authors: {str(e)[:300]}"


@function_tool
@with_timeout()
async def get_author_works(author_id: str, limit: int = 10) -> str:
  """Get papers by a specific author using their OpenAlex ID.

  Use this after finding an author via search_authors to see their
  most-cited publications. The author ID is the OpenAlex ID
  (e.g., A5012345678) from the search results.

  Args:
      author_id: The OpenAlex author ID (e.g., A5012345678).
      limit: Max papers to return (default 10, max 50).

  Returns:
      A formatted list of the author's most-cited papers.
  """
  limit = min(max(1, limit), 50)
  oaid = author_id.strip().rstrip("/")
  if "/" in oaid:
    oaid = oaid.rsplit("/", 1)[-1]
  if not oaid.startswith("A"):
    oaid = f"A{oaid}" if oaid.isdigit() else oaid

  try:
    import httpx

    params: dict[str, str | int] = {
      "filter": f"authorships.author.id:{oaid}",
      "per_page": min(limit, 50),
      "sort": "cited_by_count:desc",
      "select": "id,title,authorships,publication_year,doi,cited_by_count",
    }
    if settings.OPENALEX_API_KEY:
      params["api_key"] = settings.OPENALEX_API_KEY

    async with httpx.AsyncClient(timeout=15.0) as client:
      resp = await client.get("https://api.openalex.org/works", params=params)
      resp.raise_for_status()
      data = resp.json()

    results = data.get("results", [])
    if not results:
      return f"No works found for author ID '{author_id}'."

    lines = [f"Papers by author {author_id}:\n"]
    for i, work in enumerate(results, 1):
      authors = []
      for a in work.get("authorships") or []:
        ad = a.get("author") or {}
        if ad.get("display_name"):
          authors.append(ad["display_name"])

      lines.append(f"{i}. {work.get('title', '')}")
      if authors:
        lines.append(f"   Authors: {', '.join(authors[:5])}")
      parts = []
      if work.get("publication_year"):
        parts.append(f"Year: {work['publication_year']}")
      if work.get("cited_by_count") is not None:
        parts.append(f"Citations: {work['cited_by_count']}")
      doi = work.get("doi", "")
      if doi:
        parts.append(f"DOI: {doi.replace('https://doi.org/', '')}")
      if parts:
        lines.append(f"   {' | '.join(parts)}")
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    logger.error("Error in get_author_works", author_id=author_id, error=str(e))
    return f"Error fetching author works: {str(e)[:300]}"
