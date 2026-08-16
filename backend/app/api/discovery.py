import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, List, Optional, cast

import redis as redis_sync
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import get_logger
from app.dependencies import CurrentUser, get_db, scoped_user_id
from app.models.discovery import (
  DiscoveredPaper,
  DiscoverySession,
  discovery_session_papers,
)
from app.models.group import Group
from app.models.paper import Paper, paper_group_association
from app.schemas.discovery import (
  AddToLibraryResponse,
  AISearchRequest,
  AISearchResponse,
  AuthorProfile,
  AuthorSearchResponse,
  AuthorWork,
  AuthorWorksResponse,
  BatchAddToLibraryRequest,
  BatchAddToLibraryResponse,
  CitationExplorerRequest,
  CitationExplorerResponse,
  ClusteringResult,
  DiscoveredPaperPreview,
  DiscoverySearchRequest,
  DiscoverySearchResponse,
  DiscoverySessionCreate,
  DiscoverySessionDetail,
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
from app.schemas.discovery import (
  DiscoverySession as DiscoverySessionSchema,
)
from app.services.access import apply_visible_papers_filter
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
  user: CurrentUser,
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

  from app.services.ai.helpers import get_provider_for_user

  ai_provider = await get_provider_for_user(
    session, user.id, preferred_provider_id=request.provider_id
  )

  # Convert schema filters to service filters
  filters = None
  if request.filters:
    filters = SearchFilters(
      year_from=request.filters.year_from,
      year_to=request.filters.year_to,
      authors=request.filters.authors,
      min_citations=request.filters.min_citations,
    )

  # Perform query understanding first if needed to get the boolean query
  query_understanding_data = None
  search_query = request.query
  try:
    query_understanding_data = await ai_search_service.understand_query(
      request.query, provider=ai_provider
    )
    if query_understanding_data and query_understanding_data.get("boolean_query"):
      search_query = query_understanding_data["boolean_query"]
  except Exception as e:
    logger.warning(f"Query understanding failed before search: {e}")

  # Search each source with appropriate query routing
  source_results = []
  all_papers = []

  # Search all providers in parallel with their respective queries
  async def search_single_source(source_name: str):
    provider_query = search_query
    if source_name in ["arxiv", "semantic_scholar"]:
      provider_query = request.query

    try:
      return await asyncio.wait_for(
        discovery_service.search_source(
          session=session,
          source=source_name,
          query=provider_query,
          filters=filters,
          limit=request.limit,
          cache_results=True,
        ),
        timeout=45.0,
      )
    except asyncio.TimeoutError:
      return {
        "source": source_name,
        "papers": [],
        "total_available": None,
        "error": "Search timed out",
      }
    except Exception as e:
      return {
        "source": source_name,
        "papers": [],
        "total_available": None,
        "error": str(e),
      }

  # Run searches in parallel
  search_tasks = [search_single_source(src) for src in request.sources]
  results = await asyncio.gather(*search_tasks)

  # Convert to response schema
  total_results = 0
  for src_result in results:
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
      for p in src_result.get("papers", [])
    ]
    source_results.append(
      SourceSearchResult(
        source=src_result["source"],
        papers=papers,
        total_available=src_result.get("total_available"),
        error=src_result.get("error"),
      )
    )
    all_papers.extend(src_result.get("papers", []))
    total_results += src_result.get("total_available") or len(
      src_result.get("papers", [])
    )

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
    provider=ai_provider,
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
    query=request.query,
    query_understanding=query_understanding,
    sources_searched=request.sources,
    results=source_results,
    total_results=total_results,
    deduplicated_count=len(all_papers),
    overview=overview,
    clustering=clustering,
    relevance_explanations=relevance_explanations,
  )


def _sse_event(event_type: str, data: dict) -> str:
  """Format a server-sent event."""
  json_data = json.dumps(data, default=str)
  return f"event: {event_type}\ndata: {json_data}\n\n"


def _redis_client() -> redis_sync.Redis:
  return redis_sync.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True,
  )


@router.post("/ai-search/stream")
async def ai_search_stream(
  request: AISearchRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Stream AI-enhanced search results via SSE.

  Enqueues Celery tasks for each source search and AI enhancement,
  then polls Redis for progress and streams results as they arrive.
  The FastAPI event loop is free between polls.
  """

  async def event_generator() -> AsyncGenerator[str, None]:
    from app.tasks.discovery_tasks import ai_enhance_task, search_source_task

    try:
      if not request.query or not request.query.strip():
        yield _sse_event("error", {"message": "Query cannot be empty"})
        return

      search_id = str(uuid.uuid4())
      sources = request.sources or ["arxiv", "semantic_scholar"]
      r = _redis_client()

      yield _sse_event(
        "status", {"stage": "starting", "message": "Starting search...", "progress": 0}
      )

      # Resolve the user's configured AI provider once for in-request use.
      from app.services.ai.helpers import get_provider_for_user

      ai_provider = await get_provider_for_user(
        session, user.id, preferred_provider_id=request.provider_id
      )

      # Query understanding runs in-request — it's fast (~1s) and needed to
      # route queries correctly to providers before we enqueue tasks.
      search_query = request.query
      try:
        yield _sse_event(
          "status",
          {"stage": "understanding", "message": "Analyzing query...", "progress": 5},
        )
        qu = await asyncio.wait_for(
          ai_search_service.understand_query(request.query, provider=ai_provider),
          timeout=10.0,
        )
        if qu:
          if qu.get("boolean_query"):
            search_query = qu["boolean_query"]
          yield _sse_event(
            "query_understanding",
            {
              "interpreted_query": qu.get("interpreted_query", request.query),
              "boolean_query": qu.get("boolean_query"),
              "key_concepts": qu.get("key_concepts", []),
              "search_terms": qu.get("search_terms", []),
              "domain_hints": qu.get("domain_hints", []),
              "query_type": qu.get("query_type", "exploratory"),
            },
          )
      except Exception as e:
        logger.warning("Query understanding failed", error=str(e))

      # Build filters dict for serialization into Celery task
      filters_dict = None
      if request.filters:
        filters_dict = {
          k: v for k, v in request.filters.model_dump().items() if v is not None
        }

      # Enqueue one search task per source
      for source_name in sources:
        provider_query = (
          request.query
          if source_name in ("arxiv", "semantic_scholar")
          else search_query
        )
        search_source_task.delay(
          search_id, source_name, provider_query, filters_dict, request.limit or 20
        )

      yield _sse_event(
        "status",
        {
          "stage": "searching",
          "message": f"Searching {len(sources)} sources...",
          "progress": 10,
        },
      )

      # Poll Redis progress list until all sources report back, then AI completes
      expected_source_events = set(sources)
      received_sources: dict[str, list] = {}
      ai_keys = {"overview", "clustering", "relevance"}
      expected_ai = set()
      if request.include_overview:
        expected_ai.add("overview")
      if request.include_clustering:
        expected_ai.add("clustering")
      if request.include_relevance:
        expected_ai.add("relevance")

      ai_task_enqueued = False
      progress_key = f"discovery:{search_id}:progress"
      # Must outlast ai_enhance_task's hard time_limit (600s) so the stream
      # stays open until clustering/relevance finish on slow providers.
      deadline = asyncio.get_event_loop().time() + 660.0

      while True:
        if asyncio.get_event_loop().time() > deadline:
          yield _sse_event("error", {"message": "Search timed out"})
          break

        # Non-blocking poll — yields control to event loop between checks
        raw = await asyncio.to_thread(r.blpop, progress_key, 2)

        if raw is None:
          # No progress yet — send keepalive, then check if we're done
          if not expected_source_events and (not expected_ai or not ai_task_enqueued):
            break
          yield _sse_event("keepalive", {})
          continue

        _, marker_json = raw
        marker = json.loads(marker_json)
        event_type = marker.get("type")

        if event_type == "source_results":
          source_name = marker["source"]
          expected_source_events.discard(source_name)

          if "error" in marker:
            yield _sse_event(
              "source_results",
              {"source": source_name, "papers": [], "error": marker["error"]},
            )
          else:
            papers_data = json.loads(
              r.get(f"discovery:{search_id}:source:{source_name}") or "[]"
            )
            received_sources[source_name] = papers_data
            yield _sse_event(
              "source_results",
              {
                "source": source_name,
                "papers": papers_data,
                "paper_count": len(papers_data),
              },
            )

          # Once all sources are done, enqueue AI enhancement
          if not expected_source_events and not ai_task_enqueued:
            all_papers = [p for papers in received_sources.values() for p in papers]
            if all_papers and expected_ai:
              ai_enhance_task.delay(
                search_id,
                request.query,
                all_papers,
                request.include_overview or False,
                request.include_clustering or False,
                request.include_relevance or False,
                user_id=user.id,
              )
              ai_task_enqueued = True
              yield _sse_event(
                "status",
                {
                  "stage": "enhancing",
                  "message": "Generating AI insights...",
                  "progress": 50,
                },
              )
            else:
              # No papers or no AI requested — we're done
              break

        elif event_type in ai_keys:
          expected_ai.discard(event_type)
          result_raw = r.get(f"discovery:{search_id}:ai:{event_type}")
          if result_raw:
            result = json.loads(result_raw)
            label = {
              "overview": "Building overview...",
              "clustering": "Clustering topics...",
              "relevance": "Ranking relevance...",
            }
            yield _sse_event(
              "status",
              {
                "stage": event_type,
                "message": label.get(event_type, event_type),
                "progress": 50 + len(ai_keys - expected_ai) * 15,
              },
            )
            yield _sse_event(event_type, result)

        elif event_type == "complete":
          break

      all_papers = [p for papers in received_sources.values() for p in papers]
      yield _sse_event(
        "status", {"stage": "complete", "message": "Search complete", "progress": 100}
      )
      yield _sse_event(
        "complete",
        {
          "query": request.query,
          "total_results": len(all_papers),
          "sources_searched": list(received_sources.keys()),
        },
      )

    except GeneratorExit:
      return
    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error("Stream error", error=str(e))
      yield _sse_event("error", {"message": str(e)})
    finally:
      try:
        r.close()
      except Exception:
        pass

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
  user: CurrentUser,
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
      user_id=user.id,
    )

    return AddToLibraryResponse(
      paper_id=cast(int, paper.id),
      title=cast(str, paper.title),
      message="Paper added to library successfully",
    )

  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e)) from e
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
  user: CurrentUser,
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
        user_id=user.id,
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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Get paper recommendations.

  Can be based on:
  - A specific paper (provide paper_id)
  - The current user's library (default)
  - A specific group (provide group_id)
  """
  recommendations = []
  uid = scoped_user_id(user)

  if request.based_on == "paper" and request.paper_id:
    # Get recommendations for a specific paper — must be in user's library
    paper_stmt = select(Paper).where(Paper.id == request.paper_id)
    paper_stmt = apply_visible_papers_filter(paper_stmt, uid)
    paper = (await session.execute(paper_stmt)).scalar_one_or_none()
    if not paper:
      raise HTTPException(status_code=404, detail="Paper not found")

    for source in request.sources:
      if paper.doi:
        results = await discovery_service.get_recommendations(
          session, source, cast(str, paper.doi), request.limit
        )
        recommendations.extend(results)

  elif request.based_on == "group" and request.group_id:
    # Get recommendations based on a specific group owned by the user
    group_stmt = select(Group).where(Group.id == request.group_id)
    if uid is not None:
      group_stmt = group_stmt.where(Group.user_id == uid)
    group = (await session.execute(group_stmt)).scalar_one_or_none()
    if not group:
      raise HTTPException(status_code=404, detail="Group not found")

    seed_stmt = (
      select(Paper)
      .join(paper_group_association, Paper.id == paper_group_association.c.paper_id)
      .where(
        paper_group_association.c.group_id == request.group_id,
        Paper.doi.isnot(None),
      )
      .order_by(Paper.created_at.desc())
      .limit(5)
    )
    papers = (await session.execute(seed_stmt)).scalars().all()

    for paper in papers:
      for source in request.sources:
        if paper.doi:
          results = await discovery_service.get_recommendations(
            session, source, cast(str, paper.doi), max(1, request.limit // 5)
          )
          recommendations.extend(results)

  elif request.based_on == "library":
    # Get recommendations based on the current user's own library
    seed_stmt = select(Paper).where(Paper.doi.isnot(None))
    seed_stmt = apply_visible_papers_filter(seed_stmt, uid)
    seed_stmt = seed_stmt.order_by(Paper.created_at.desc()).limit(5)
    papers = (await session.execute(seed_stmt)).scalars().all()

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


# Discovery Sessions Endpoints


@router.get("/sessions", response_model=List[DiscoverySessionSchema])
async def list_discovery_sessions(
  user: CurrentUser,
  limit: int = Query(default=50, le=100),
  offset: int = Query(default=0, ge=0),
  session: AsyncSession = Depends(get_db),
):
  stmt = (
    select(DiscoverySession)
    .where(DiscoverySession.user_id == scoped_user_id(user))
    .order_by(DiscoverySession.updated_at.desc())
    .offset(offset)
    .limit(limit)
  )

  result = await session.execute(stmt)
  sessions_list = result.scalars().all()

  return [
    DiscoverySessionSchema(
      id=cast(int, s.id),
      name=cast(str | None, s.name),
      query=cast(str, s.query),
      sources=cast(list[str], s.sources) or [],
      filters_json=cast(dict, s.filters_json) or {},
      created_at=cast(datetime, s.created_at),
      updated_at=cast(datetime, s.updated_at),
      paper_count=len(cast(dict[str, Any], s.papers_json)) if s.papers_json else 0,
    )
    for s in sessions_list
  ]


@router.post("/sessions", response_model=DiscoverySessionSchema)
async def create_discovery_session(
  request: DiscoverySessionCreate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  discovery_session = DiscoverySession(
    user_id=scoped_user_id(user),
    name=request.name,
    query=request.query,
    sources=request.sources,
    filters_json=request.filters_json,
    query_understanding=request.query_understanding,
    overview=request.overview,
    clustering=request.clustering,
    relevance_explanations=request.relevance_explanations,
    papers_json=request.papers,
  )
  session.add(discovery_session)
  await session.commit()
  await session.refresh(discovery_session)

  paper_count = len(request.papers) if request.papers else 0

  return DiscoverySessionSchema(
    id=cast(int, discovery_session.id),
    name=cast(str | None, discovery_session.name),
    query=cast(str, discovery_session.query),
    sources=cast(list[str], discovery_session.sources) or [],
    filters_json=cast(dict, discovery_session.filters_json) or {},
    created_at=cast(datetime, discovery_session.created_at),
    updated_at=cast(datetime, discovery_session.updated_at),
    paper_count=paper_count,
  )


@router.get("/sessions/{session_id}", response_model=DiscoverySessionDetail)
async def get_discovery_session(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  result = await session.execute(
    select(DiscoverySession).where(
      DiscoverySession.id == session_id,
      DiscoverySession.user_id == scoped_user_id(user),
    )
  )
  discovery_session = result.scalar_one_or_none()
  if not discovery_session:
    raise HTTPException(status_code=404, detail="Discovery session not found")

  papers_json = discovery_session.papers_json or []
  paper_previews = [
    DiscoveredPaperPreview(
      source=p.get("source", ""),
      external_id=p.get("external_id", ""),
      title=p.get("title", ""),
      authors=p.get("authors", []),
      abstract=p.get("abstract"),
      year=p.get("year"),
      doi=p.get("doi"),
      url=p.get("url"),
      pdf_url=p.get("pdf_url"),
      citation_count=p.get("citation_count"),
      relevance_score=p.get("relevance_score"),
    )
    for p in papers_json
  ]

  return DiscoverySessionDetail(
    id=cast(int, discovery_session.id),
    name=cast(str | None, discovery_session.name),
    query=cast(str, discovery_session.query),
    sources=cast(list[str], discovery_session.sources) or [],
    filters_json=cast(dict, discovery_session.filters_json) or {},
    created_at=cast(datetime, discovery_session.created_at),
    updated_at=cast(datetime, discovery_session.updated_at),
    paper_count=len(paper_previews),
    papers=paper_previews,
    query_understanding=cast(dict[str, Any], discovery_session.query_understanding),
    overview=cast(dict[str, Any], discovery_session.overview),
    clustering=cast(dict[str, Any], discovery_session.clustering),
    relevance_explanations=cast(
      list[dict[str, Any]], discovery_session.relevance_explanations
    ),
  )


@router.delete("/sessions/{session_id}")
async def delete_discovery_session(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  result = await session.execute(
    select(DiscoverySession).where(
      DiscoverySession.id == session_id,
      DiscoverySession.user_id == scoped_user_id(user),
    )
  )
  discovery_session = result.scalar_one_or_none()
  if not discovery_session:
    raise HTTPException(status_code=404, detail="Discovery session not found")

  await session.delete(discovery_session)
  await session.commit()

  return {"message": "Discovery session deleted", "id": session_id}


@router.put("/sessions/{session_id}", response_model=DiscoverySessionSchema)
async def update_discovery_session(
  session_id: int,
  user: CurrentUser,
  name: Optional[str] = Query(default=None),
  session: AsyncSession = Depends(get_db),
):
  result = await session.execute(
    select(DiscoverySession).where(
      DiscoverySession.id == session_id,
      DiscoverySession.user_id == scoped_user_id(user),
    )
  )
  discovery_session = result.scalar_one_or_none()
  if not discovery_session:
    raise HTTPException(status_code=404, detail="Discovery session not found")

  if name is not None:
    discovery_session.name = name

  await session.commit()
  await session.refresh(discovery_session)

  from sqlalchemy import func

  stmt = select(func.count(discovery_session_papers.c.discovered_paper_id)).where(
    discovery_session_papers.c.session_id == session_id
  )
  count_result = await session.execute(stmt)
  paper_count = count_result.scalar() or 0

  return DiscoverySessionSchema(
    id=cast(int, discovery_session.id),
    name=cast(str | None, discovery_session.name),
    query=cast(str, discovery_session.query),
    sources=cast(list[str], discovery_session.sources) or [],
    filters_json=cast(dict, discovery_session.filters_json) or {},
    created_at=cast(datetime, discovery_session.created_at),
    updated_at=cast(datetime, discovery_session.updated_at),
    paper_count=paper_count,
  )


@router.get(
  "/authors/search",
  response_model=AuthorSearchResponse,
  summary="Search author profiles by name",
  description="Search for researcher profiles across all disciplines via OpenAlex. "
  "Returns name, institution, h-index, publication count, and citation stats.",
)
async def search_authors_endpoint(
  name: str = Query(..., description="Author name to search for"),
  limit: int = Query(default=10, ge=1, le=50, description="Max results"),
  current_user: CurrentUser = None,
) -> AuthorSearchResponse:
  """Search for author profiles by name."""
  from typing import cast as typing_cast

  from app.services.discovery.provider_registry import provider_registry

  provider = provider_registry.get("openalex")
  if not provider:
    raise HTTPException(status_code=503, detail="OpenAlex provider not available")

  raw_results = await typing_cast(Any, provider).search_authors(query=name, limit=limit)

  results = []
  for a in raw_results:
    institutions = []
    for inst in a.get("last_known_institutions", []) or []:
      institutions.append(
        {
          "name": inst.get("display_name"),
          "country": inst.get("country_code"),
          "type": inst.get("type"),
        }
      )
    topics = []
    for topic in a.get("topics", []) or []:
      topics.append(
        {
          "name": topic.get("display_name"),
          "subfield": (topic.get("subfield") or {}).get("display_name"),
          "field": (topic.get("field") or {}).get("display_name"),
        }
      )
    oaid = a.get("id", "").rstrip("/")
    if "/" in oaid:
      oaid = oaid.rsplit("/", 1)[-1]

    results.append(
      AuthorProfile(
        openalex_id=oaid,
        display_name=a.get("display_name", ""),
        works_count=a.get("works_count"),
        cited_by_count=a.get("cited_by_count"),
        h_index=a.get("h_index"),
        i10_index=a.get("i10_index"),
        orcid=a.get("orcid"),
        institutions=institutions,
        topics=topics,
      )
    )

  return AuthorSearchResponse(
    query=name,
    results=results,
    total=len(results),
  )


@router.get(
  "/authors/{author_id}/works",
  response_model=AuthorWorksResponse,
  summary="Get papers by author",
  description="Get the most-cited papers by a specific author using their OpenAlex ID.",
)
async def get_author_works_endpoint(
  author_id: str,
  limit: int = Query(default=20, ge=1, le=100, description="Max papers"),
  current_user: CurrentUser = None,
) -> AuthorWorksResponse:
  """Get papers by a specific author."""
  from typing import cast as typing_cast

  from app.services.discovery.provider_registry import provider_registry

  provider = provider_registry.get("openalex")
  if not provider:
    raise HTTPException(status_code=503, detail="OpenAlex provider not available")

  typed = typing_cast(Any, provider)

  # First get the author profile for the display name
  profile = await typed.get_author_details(author_id)
  display_name = profile.get("display_name", "") if profile else ""

  works = await typed.get_author_works(author_id, limit=limit)

  results = []
  for w in works:
    results.append(
      AuthorWork(
        openalex_id=w.external_id,
        title=w.title,
        publication_year=w.year,
        cited_by_count=w.citation_count,
        doi=w.doi,
        authors=w.authors,
      )
    )

  return AuthorWorksResponse(
    author_id=author_id,
    display_name=display_name,
    results=results,
    total=len(results),
  )
