import asyncio
import json
from typing import AsyncGenerator, List, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.dependencies import get_db
from app.models.discovery import DiscoveredPaper
from app.models.paper import Paper
from app.schemas.discovery import (
  AddToLibraryResponse,
  AISearchRequest,
  AISearchResponse,
  BatchAddToLibraryRequest,
  BatchAddToLibraryResponse,
  CitationExplorerRequest,
  CitationExplorerResponse,
  ClusteringResult,
  DiscoveredPaperPreview,
  DiscoverySearchRequest,
  DiscoverySearchResponse,
  DiscoverySourceInfo,
  DiscoverySourcesResponse,
  PaperCluster,
  PaperRelevanceExplanation,
  QueryUnderstanding,
  RecommendationRequest,
  RecommendationResponse,
  RelevanceExplanations,
  SearchOverview,
  SourceSearchResult,
)
from app.services.discovery import SearchFilters, discovery_service
from app.services.discovery.ai_search_service import ai_search_service
from app.services.ingestion import ingestion_service

logger = get_logger(__name__)

router = APIRouter()


@router.get("/sources", response_model=DiscoverySourcesResponse)
async def list_sources():
  """List all available discovery sources."""
  source_infos = discovery_service.get_source_infos()
  return DiscoverySourcesResponse(
    sources=[DiscoverySourceInfo(**info) for info in source_infos]
  )


@router.post("/search", response_model=DiscoverySearchResponse)
async def search_papers(
  request: DiscoverySearchRequest,
  session: AsyncSession = Depends(get_db),
):
  """Search for papers across multiple sources.

  Searches external databases (arXiv, Semantic Scholar, etc.) for papers
  matching the query. Results are cached locally and deduplicated across sources.
  """
  if not request.query or not request.query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  # Convert schema filters to service filters
  filters = None
  if request.filters:
    filters = SearchFilters(
      year_from=request.filters.year_from,
      year_to=request.filters.year_to,
      authors=request.filters.authors,
      min_citations=request.filters.min_citations,
    )

  try:
    result = await asyncio.wait_for(
      discovery_service.search(
        session=session,
        query=request.query,
        sources=request.sources,
        filters=filters,
        limit=request.limit,
        cache_results=True,
      ),
      timeout=45.0,  # 45 second timeout for search
    )
  except asyncio.TimeoutError as e:
    raise HTTPException(
      status_code=504,
      detail="Search timed out. Please try again with fewer sources or a simpler query.",
    ) from e

  # Convert to response schema
  source_results = []
  for src_result in result["results"]:
    papers = [
      DiscoveredPaperPreview(
        source=p["source"],
        external_id=p["external_id"],
        title=p["title"],
        authors=p.get("authors", []),
        abstract=p.get("abstract"),
        year=p.get("year"),
        doi=p.get("doi"),
        url=p.get("url"),
        pdf_url=p.get("pdf_url"),
        citation_count=p.get("citation_count"),
        relevance_score=p.get("relevance_score"),
      )
      for p in src_result["papers"]
    ]
    source_results.append(
      SourceSearchResult(
        source=src_result["source"],
        papers=papers,
        total_available=src_result.get("total_available"),
        error=src_result.get("error"),
      )
    )

  return DiscoverySearchResponse(
    query=result["query"],
    sources_searched=result["sources_searched"],
    results=source_results,
    total_results=result["total_results"],
    deduplicated_count=result["deduplicated_count"],
  )


@router.post("/ai-search", response_model=AISearchResponse)
async def ai_search_papers(
  request: AISearchRequest,
  session: AsyncSession = Depends(get_db),
):
  """AI-enhanced search for papers with natural language understanding.

  This endpoint provides:
  - Natural language query understanding
  - AI-generated search overview
  - Topic-based clustering of results
  - Relevance explanations for each paper

  Use this for a Google-like search experience with grouped results
  and contextual understanding of the research landscape.
  """
  if not request.query or not request.query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  # Convert schema filters to service filters
  filters = None
  if request.filters:
    filters = SearchFilters(
      year_from=request.filters.year_from,
      year_to=request.filters.year_to,
      authors=request.filters.authors,
      min_citations=request.filters.min_citations,
    )

  # Perform the regular search first with timeout
  try:
    search_result = await asyncio.wait_for(
      discovery_service.search(
        session=session,
        query=request.query,
        sources=request.sources,
        filters=filters,
        limit=request.limit,
        cache_results=True,
      ),
      timeout=45.0,  # 45 second timeout for search
    )
  except asyncio.TimeoutError as e:
    raise HTTPException(
      status_code=504,
      detail="Search timed out. Please try again with fewer sources or a simpler query.",
    ) from e

  # Convert to response schema
  source_results = []
  all_papers = []
  for src_result in search_result["results"]:
    papers = [
      DiscoveredPaperPreview(
        source=p["source"],
        external_id=p["external_id"],
        title=p["title"],
        authors=p.get("authors", []),
        abstract=p.get("abstract"),
        year=p.get("year"),
        doi=p.get("doi"),
        url=p.get("url"),
        pdf_url=p.get("pdf_url"),
        citation_count=p.get("citation_count"),
        relevance_score=p.get("relevance_score"),
      )
      for p in src_result["papers"]
    ]
    source_results.append(
      SourceSearchResult(
        source=src_result["source"],
        papers=papers,
        total_available=src_result.get("total_available"),
        error=src_result.get("error"),
      )
    )
    all_papers.extend(src_result["papers"])

  # Build ExternalPaperResult list for AI service
  from app.services.discovery.base_provider import ExternalPaperResult

  paper_results = [
    ExternalPaperResult(
      source=p["source"],
      external_id=p["external_id"],
      title=p["title"],
      authors=p.get("authors", []),
      abstract=p.get("abstract"),
      year=p.get("year"),
      doi=p.get("doi"),
      url=p.get("url"),
      pdf_url=p.get("pdf_url"),
      citation_count=p.get("citation_count"),
      relevance_score=p.get("relevance_score"),
    )
    for p in all_papers
  ]

  # Run AI enhancement
  ai_result = await ai_search_service.enhance_search_results(
    query=request.query,
    papers=paper_results,
    include_overview=request.include_overview,
    include_clustering=request.include_clustering,
    include_relevance=request.include_relevance,
  )

  # Convert AI results to response schemas
  query_understanding = None
  if "query_understanding" in ai_result:
    qu = ai_result["query_understanding"]
    query_understanding = QueryUnderstanding(
      interpreted_query=qu.get("interpreted_query", request.query),
      key_concepts=qu.get("key_concepts", []),
      search_terms=qu.get("search_terms", []),
      domain_hints=qu.get("domain_hints", []),
      query_type=qu.get("query_type", "exploratory"),
    )

  overview = None
  if "overview" in ai_result:
    ov = ai_result["overview"]
    overview = SearchOverview(
      overview=ov.get("overview", ""),
      key_themes=ov.get("key_themes", []),
      notable_trends=ov.get("notable_trends", []),
      research_gaps=ov.get("research_gaps", []),
      suggested_followups=ov.get("suggested_followups", []),
    )

  clustering = None
  if "clustering" in ai_result:
    cl = ai_result["clustering"]
    clusters = [
      PaperCluster(
        name=c.get("name", "Uncategorized"),
        description=c.get("description", ""),
        keywords=c.get("keywords", []),
        paper_indices=c.get("paper_indices", []),
      )
      for c in cl.get("clusters", [])
    ]
    clustering = ClusteringResult(
      clusters=clusters,
      unclustered_indices=cl.get("unclustered_indices", []),
    )

  relevance_explanations = None
  if "relevance_explanations" in ai_result:
    re = ai_result["relevance_explanations"]
    explanations = [
      PaperRelevanceExplanation(
        paper_index=e.get("paper_index", 0),
        relevance=e.get("relevance", ""),
        key_contribution=e.get("key_contribution", ""),
        relevance_score=e.get("relevance_score", 0.5),
      )
      for e in re.get("explanations", [])
    ]
    relevance_explanations = RelevanceExplanations(explanations=explanations)

  return AISearchResponse(
    query=search_result["query"],
    query_understanding=query_understanding,
    sources_searched=search_result["sources_searched"],
    results=source_results,
    total_results=search_result["total_results"],
    deduplicated_count=search_result["deduplicated_count"],
    overview=overview,
    clustering=clustering,
    relevance_explanations=relevance_explanations,
  )


def _sse_event(event_type: str, data: dict) -> str:
  """Format a server-sent event."""
  json_data = json.dumps(data, default=str)
  return f"event: {event_type}\ndata: {json_data}\n\n"


@router.post("/ai-search/stream")
async def ai_search_stream(
  request: AISearchRequest,
  session: AsyncSession = Depends(get_db),
):
  """Stream AI-enhanced search results with real-time updates.

  Returns a stream of server-sent events (SSE) with progress updates
  as each stage of the search completes.

  Event types:
  - status: Progress update with stage and message
  - source_results: Results from a single source
  - query_understanding: AI query analysis
  - overview: AI-generated search overview
  - clustering: Topic clustering results
  - relevance: Relevance explanations
  - complete: Final signal that stream is done
  - error: Error information
  """

  async def event_generator() -> AsyncGenerator[str, None]:
    try:
      if not request.query or not request.query.strip():
        yield _sse_event("error", {"message": "Query cannot be empty"})
        return

      # Stage 1: Parse query and prepare search
      yield _sse_event(
        "status",
        {"stage": "starting", "message": "Starting search...", "progress": 0},
      )

      # Convert filters
      filters = None
      if request.filters:
        filters = SearchFilters(
          year_from=request.filters.year_from,
          year_to=request.filters.year_to,
          authors=request.filters.authors,
          min_citations=request.filters.min_citations,
        )

      # Stage 2: Understand query (blocking for better search results)
      yield _sse_event(
        "status",
        {
          "stage": "understanding",
          "message": "Analyzing query to improve search...",
          "progress": 5,
        },
      )

      query_understanding = None
      search_query = request.query

      try:
        query_understanding = await ai_search_service.understand_query(request.query)

        if query_understanding:
          # Use the optimized boolean query if available
          if query_understanding.get("boolean_query"):
            search_query = query_understanding["boolean_query"]

          yield _sse_event(
            "query_understanding",
            {
              "interpreted_query": query_understanding.get(
                "interpreted_query", request.query
              ),
              "boolean_query": query_understanding.get("boolean_query"),
              "key_concepts": query_understanding.get("key_concepts", []),
              "search_terms": query_understanding.get("search_terms", []),
              "domain_hints": query_understanding.get("domain_hints", []),
              "query_type": query_understanding.get("query_type", "exploratory"),
            },
          )
      except Exception as e:
        logger.warning(f"Query understanding failed: {e}")

      # Stage 3: Search each source
      sources = request.sources
      all_papers: List[dict] = []
      source_results: List[SourceSearchResult] = []

      for i, source_name in enumerate(sources):
        progress = 10 + (i * 30 // len(sources))
        yield _sse_event(
          "status",
          {
            "stage": "searching",
            "message": f"Searching {source_name}...",
            "progress": progress,
            "source": source_name,
          },
        )

        try:
          # Search single source with timeout
          source_result = await asyncio.wait_for(
            discovery_service.search_source(
              session=session,
              source=source_name,
              query=search_query,  # Use optimized query
              filters=filters,
              limit=request.limit,
            ),
            timeout=20.0,
          )

          papers = [
            DiscoveredPaperPreview(
              source=p["source"],
              external_id=p["external_id"],
              title=p["title"],
              authors=p.get("authors", []),
              abstract=p.get("abstract"),
              year=p.get("year"),
              doi=p.get("doi"),
              url=p.get("url"),
              pdf_url=p.get("pdf_url"),
              citation_count=p.get("citation_count"),
              relevance_score=p.get("relevance_score"),
            )
            for p in source_result.get("papers", [])
          ]

          result = SourceSearchResult(
            source=source_name,
            papers=papers,
            total_available=source_result.get("total_available"),
            error=source_result.get("error"),
          )
          source_results.append(result)
          all_papers.extend(source_result.get("papers", []))

          # Stream this source's results immediately
          yield _sse_event(
            "source_results",
            {
              "source": source_name,
              "papers": [p.model_dump() for p in papers],
              "total_available": source_result.get("total_available"),
              "paper_count": len(papers),
            },
          )

        except asyncio.TimeoutError:
          yield _sse_event(
            "source_results",
            {
              "source": source_name,
              "papers": [],
              "error": f"{source_name} search timed out",
            },
          )
        except Exception as e:
          logger.error(f"Error searching {source_name}", error=str(e))
          yield _sse_event(
            "source_results",
            {"source": source_name, "papers": [], "error": str(e)},
          )

      # Stage 4: Analysis complete (already done in Stage 2)
      yield _sse_event(
        "status",
        {
          "stage": "analyzing",
          "message": "Analysis complete...",
          "progress": 45,
        },
      )

      # (Query understanding was already emitted in Stage 2)

      # Stage 5: AI enhancements (parallel)
      if all_papers and (
        request.include_overview
        or request.include_clustering
        or request.include_relevance
      ):
        yield _sse_event(
          "status",
          {
            "stage": "enhancing",
            "message": "Generating AI insights...",
            "progress": 50,
          },
        )

        # Build paper results for AI service
        from app.services.discovery.base_provider import ExternalPaperResult

        paper_results = [
          ExternalPaperResult(
            source=p["source"],
            external_id=p["external_id"],
            title=p["title"],
            authors=p.get("authors", []),
            abstract=p.get("abstract"),
            year=p.get("year"),
            doi=p.get("doi"),
            url=p.get("url"),
            pdf_url=p.get("pdf_url"),
            citation_count=p.get("citation_count"),
            relevance_score=p.get("relevance_score"),
          )
          for p in all_papers
        ]

        # Create AI tasks
        ai_tasks = {}
        if request.include_overview:
          ai_tasks["overview"] = asyncio.create_task(
            ai_search_service.generate_search_overview(request.query, paper_results)
          )
        if request.include_clustering and len(paper_results) >= 3:
          ai_tasks["clustering"] = asyncio.create_task(
            ai_search_service.cluster_papers(paper_results)
          )
        if request.include_relevance:
          ai_tasks["relevance"] = asyncio.create_task(
            ai_search_service.explain_relevance(request.query, paper_results)
          )

        # Stream AI results as they complete
        completed = set()
        ai_timeout = 25.0
        start_time = asyncio.get_event_loop().time()

        while ai_tasks and len(completed) < len(ai_tasks):
          elapsed = asyncio.get_event_loop().time() - start_time
          if elapsed > ai_timeout:
            logger.warning("AI enhancement timeout, returning partial results")
            break

          # Wait for any task to complete
          pending_tasks = [t for k, t in ai_tasks.items() if k not in completed]
          if not pending_tasks:
            break

          done, _ = await asyncio.wait(
            pending_tasks,
            timeout=ai_timeout - elapsed,
            return_when=asyncio.FIRST_COMPLETED,
          )

          for task in done:
            # Find which key this task belongs to
            for key, t in ai_tasks.items():
              if t == task and key not in completed:
                completed.add(key)
                progress = 50 + (len(completed) * 40 // len(ai_tasks))

                try:
                  result = task.result()
                  if result:
                    if key == "overview":
                      yield _sse_event(
                        "status",
                        {
                          "stage": "overview",
                          "message": "Generated overview",
                          "progress": progress,
                        },
                      )
                      yield _sse_event(
                        "overview",
                        {
                          "overview": result.get("overview", ""),
                          "key_themes": result.get("key_themes", []),
                          "notable_trends": result.get("notable_trends", []),
                          "research_gaps": result.get("research_gaps", []),
                          "suggested_followups": result.get("suggested_followups", []),
                        },
                      )
                    elif key == "clustering":
                      yield _sse_event(
                        "status",
                        {
                          "stage": "clustering",
                          "message": "Clustered papers",
                          "progress": progress,
                        },
                      )
                      yield _sse_event(
                        "clustering",
                        {
                          "clusters": result.get("clusters", []),
                          "unclustered_indices": result.get("unclustered_indices", []),
                        },
                      )
                    elif key == "relevance":
                      yield _sse_event(
                        "status",
                        {
                          "stage": "relevance",
                          "message": "Analyzed relevance",
                          "progress": progress,
                        },
                      )
                      yield _sse_event(
                        "relevance",
                        {"explanations": result.get("explanations", [])},
                      )
                except Exception as e:
                  logger.error(f"AI task {key} failed", error=str(e))
                break

        # Cancel any remaining tasks
        for key, task in ai_tasks.items():
          if key not in completed and not task.done():
            task.cancel()

      # Stage 6: Complete
      yield _sse_event(
        "status",
        {"stage": "complete", "message": "Search complete", "progress": 100},
      )

      yield _sse_event(
        "complete",
        {
          "query": request.query,
          "total_results": len(all_papers),
          "sources_searched": [s.source for s in source_results],
        },
      )

    except Exception as e:
      logger.error("Stream error", error=str(e))
      yield _sse_event("error", {"message": str(e)})

  return StreamingResponse(
    event_generator(),
    media_type="text/event-stream",
    headers={
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  )


@router.get("/paper/{source}/{external_id}")
async def get_paper_details(
  source: str,
  external_id: str,
  session: AsyncSession = Depends(get_db),
):
  """Get detailed information about a specific discovered paper."""
  paper = await discovery_service.get_paper_details(session, source, external_id)

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  return DiscoveredPaperPreview(
    source=paper.source,
    external_id=paper.external_id,
    title=paper.title,
    authors=paper.authors,
    abstract=paper.abstract,
    year=paper.year,
    doi=paper.doi,
    url=paper.url,
    pdf_url=paper.pdf_url,
    citation_count=paper.citation_count,
    relevance_score=paper.relevance_score,
  )


@router.post(
  "/paper/{discovered_paper_id}/add-to-library", response_model=AddToLibraryResponse
)
async def add_to_library(
  discovered_paper_id: int,
  group_ids: Optional[List[int]] = Query(default=None),
  session: AsyncSession = Depends(get_db),
):
  """Add a discovered paper to the user's library.

  Downloads the PDF (if available) and ingests it into the library.
  """
  # Get the discovered paper
  discovered = await discovery_service.get_paper_by_id(session, discovered_paper_id)

  if not discovered:
    raise HTTPException(status_code=404, detail="Discovered paper not found")

  # Check if already in library (by DOI or title)
  existing_query = select(Paper)
  if discovered.doi:
    existing_query = existing_query.where(Paper.doi == discovered.doi)
  else:
    existing_query = existing_query.where(Paper.title == discovered.title)

  existing = (await session.execute(existing_query)).scalar_one_or_none()
  if existing:
    return AddToLibraryResponse(
      paper_id=cast(int, existing.id),
      title=cast(str, existing.title),
      message="Paper already exists in library",
    )

  # Determine URL to ingest from
  ingest_url = discovered.pdf_url or discovered.url

  if not ingest_url:
    raise HTTPException(
      status_code=400,
      detail="No URL available to ingest this paper",
    )

  # Ingest the paper
  try:
    paper = await ingestion_service.ingest_paper(
      db_session=session,
      url=cast(str, ingest_url),
      group_ids=group_ids,
    )

    return AddToLibraryResponse(
      paper_id=cast(int, paper.id),
      title=cast(str, paper.title),
      message="Paper added to library successfully",
    )

  except Exception as e:
    logger.error(
      "Error adding paper to library",
      error=str(e),
      discovered_paper_id=discovered_paper_id,
    )
    raise HTTPException(
      status_code=500,
      detail=f"Failed to add paper to library: {str(e)}",
    ) from e


@router.post("/batch/add-to-library", response_model=BatchAddToLibraryResponse)
async def batch_add_to_library(
  request: BatchAddToLibraryRequest,
  session: AsyncSession = Depends(get_db),
):
  """Add multiple discovered papers to the library at once."""
  added = []
  errors = []

  for discovered_paper_id in request.discovered_paper_ids:
    try:
      # Get the discovered paper
      discovered = await discovery_service.get_paper_by_id(session, discovered_paper_id)

      if not discovered:
        errors.append(
          {
            "discovered_paper_id": discovered_paper_id,
            "error": "Paper not found",
          }
        )
        continue

      # Determine URL to ingest from
      ingest_url = discovered.pdf_url or discovered.url

      if not ingest_url:
        errors.append(
          {
            "discovered_paper_id": discovered_paper_id,
            "title": discovered.title,
            "error": "No URL available",
          }
        )
        continue

      # Ingest the paper
      paper = await ingestion_service.ingest_paper(
        db_session=session,
        url=cast(str, ingest_url),
        group_ids=request.group_ids,
      )

      added.append(
        AddToLibraryResponse(
          paper_id=cast(int, paper.id),
          title=cast(str, paper.title),
          message="Added successfully",
        )
      )

    except Exception as e:
      errors.append(
        {
          "discovered_paper_id": discovered_paper_id,
          "error": str(e),
        }
      )

  return BatchAddToLibraryResponse(added=added, errors=errors)


@router.post("/citations", response_model=CitationExplorerResponse)
async def explore_citations(
  request: CitationExplorerRequest,
  session: AsyncSession = Depends(get_db),
):
  """Explore citation network for a paper.

  Returns papers that cite the given paper and/or papers it references.
  """
  # Get the paper details first
  paper = await discovery_service.get_paper_details(
    session, request.source, request.external_id
  )

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  paper_preview = DiscoveredPaperPreview(
    source=paper.source,
    external_id=paper.external_id,
    title=paper.title,
    authors=paper.authors,
    abstract=paper.abstract,
    year=paper.year,
    doi=paper.doi,
    url=paper.url,
    pdf_url=paper.pdf_url,
    citation_count=paper.citation_count,
  )

  citations = []
  references = []

  if request.direction in ("citations", "both"):
    citation_results = await discovery_service.get_citations(
      session, request.source, request.external_id, request.limit
    )
    citations = [
      DiscoveredPaperPreview(
        source=p.source,
        external_id=p.external_id,
        title=p.title,
        authors=p.authors,
        abstract=p.abstract,
        year=p.year,
        doi=p.doi,
        url=p.url,
        pdf_url=p.pdf_url,
        citation_count=p.citation_count,
      )
      for p in citation_results
    ]

  if request.direction in ("references", "both"):
    reference_results = await discovery_service.get_references(
      session, request.source, request.external_id, request.limit
    )
    references = [
      DiscoveredPaperPreview(
        source=p.source,
        external_id=p.external_id,
        title=p.title,
        authors=p.authors,
        abstract=p.abstract,
        year=p.year,
        doi=p.doi,
        url=p.url,
        pdf_url=p.pdf_url,
        citation_count=p.citation_count,
      )
      for p in reference_results
    ]

  return CitationExplorerResponse(
    paper=paper_preview,
    citations=citations,
    references=references,
    citations_count=len(citations),
    references_count=len(references),
  )


@router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(
  request: RecommendationRequest,
  session: AsyncSession = Depends(get_db),
):
  """Get paper recommendations.

  Can be based on:
  - A specific paper (provide paper_id)
  - The entire library (default)
  - A specific group (provide group_id)
  """
  recommendations = []

  if request.based_on == "paper" and request.paper_id:
    # Get recommendations for a specific paper
    paper = await session.get(Paper, request.paper_id)
    if not paper:
      raise HTTPException(status_code=404, detail="Paper not found")

    # Use DOI or title to find in external sources
    for source in request.sources:
      # Try to get recommendations from each source
      # First need to find the paper in that source
      if paper.doi:
        results = await discovery_service.get_recommendations(
          session, source, cast(str, paper.doi), request.limit
        )
        recommendations.extend(results)

  elif request.based_on == "library":
    # Get recommendations based on library
    # This is a more complex operation - for now, get recent papers
    # and find recommendations for them
    stmt = select(Paper).where(Paper.doi.isnot(None)).limit(5)
    papers = (await session.execute(stmt)).scalars().all()

    for paper in papers:
      for source in request.sources:
        if paper.doi:
          results = await discovery_service.get_recommendations(
            session, source, cast(str, paper.doi), max(1, request.limit // 5)
          )
          recommendations.extend(results)

  # Deduplicate and convert to response
  seen_ids = set()
  unique_recommendations = []
  for paper in recommendations:
    key = f"{paper.source}:{paper.external_id}"
    if key not in seen_ids:
      seen_ids.add(key)
      unique_recommendations.append(
        DiscoveredPaperPreview(
          source=paper.source,
          external_id=paper.external_id,
          title=paper.title,
          authors=paper.authors,
          abstract=paper.abstract,
          year=paper.year,
          doi=paper.doi,
          url=paper.url,
          pdf_url=paper.pdf_url,
          citation_count=paper.citation_count,
        )
      )

  return RecommendationResponse(
    based_on=request.based_on,
    recommendations=unique_recommendations[: request.limit],
    total=len(unique_recommendations),
  )


@router.get("/cached")
async def list_cached_papers(
  source: Optional[str] = None,
  limit: int = Query(default=50, le=200),
  offset: int = Query(default=0, ge=0),
  session: AsyncSession = Depends(get_db),
):
  """List papers that have been discovered and cached locally."""
  stmt = select(DiscoveredPaper)

  if source:
    stmt = stmt.where(DiscoveredPaper.source == source)

  stmt = stmt.order_by(DiscoveredPaper.discovered_at.desc())
  stmt = stmt.offset(offset).limit(limit)

  result = await session.execute(stmt)
  papers = result.scalars().all()

  return {
    "papers": [
      DiscoveredPaperPreview(
        source=cast(str, p.source),
        external_id=cast(str, p.external_id),
        title=cast(str, p.title),
        authors=cast(list[str], p.authors) or [],
        abstract=cast(str | None, p.abstract),
        year=cast(int | None, p.year),
        doi=cast(str | None, p.doi),
        url=cast(str | None, p.url),
        pdf_url=cast(str | None, p.pdf_url),
        citation_count=cast(int | None, p.citation_count),
      )
      for p in papers
    ],
    "total": len(papers),
    "offset": offset,
    "limit": limit,
  }
