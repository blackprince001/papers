"""Search API endpoints."""

import math
from typing import cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud import (
  create_saved_search,
  delete_saved_search,
  list_saved_searches,
)
from app.dependencies import CurrentUser, get_db, scoped_user_id
from app.models.paper import Paper
from app.models.sharing import PaperShare, UserPaperState
from app.schemas.paper import Paper as PaperSchema
from app.schemas.search import (
  SavedSearchCreate,
  SavedSearchResponse,
  SearchCapabilities,
  SearchRequest,
  SearchResponse,
  SearchResult,
)
from app.services.embeddings import embedding_service
from app.services.search_service import search_service


def _sanitize_similarity(value: float) -> float:
  if value is None or math.isnan(value) or math.isinf(value):
    return 0.0
  return float(value)


def _enrich_paper(
  paper: Paper,
  state: UserPaperState | None,
  *,
  user_id: int | None = None,
  share: "PaperShare | None" = None,
) -> PaperSchema:
  data = PaperSchema.model_validate(paper).model_dump()
  if state:
    data["reading_status"] = state.reading_status or "not_started"
    data["priority"] = state.priority or "low"
    data["reading_time_minutes"] = state.reading_time_minutes or 0
    data["last_read_page"] = state.last_read_page
    data["last_read_at"] = state.last_read_at
    data["status_updated_at"] = state.status_updated_at
  if user_id is None:
    data["my_permission"] = "owner"
  elif paper.uploaded_by_id == user_id:
    data["my_permission"] = "owner"
  elif share is not None:
    data["my_permission"] = str(share.permission)
    data["is_shared"] = True
  else:
    data["my_permission"] = "viewer"
    data["is_shared"] = True
  return PaperSchema(**data)


async def _fetch_user_states(
  session: AsyncSession, user_id: int | None, paper_ids: list[int]
) -> dict[int, UserPaperState]:
  if user_id is None or not paper_ids:
    return {}
  result = await session.execute(
    select(UserPaperState).where(
      UserPaperState.user_id == user_id,
      UserPaperState.paper_id.in_(paper_ids),
    )
  )
  return {cast(int, s.paper_id): s for s in result.scalars().all()}


async def _fetch_share_info(
  session: AsyncSession, user_id: int | None, paper_ids: list[int]
) -> dict[int, PaperShare]:
  if user_id is None or not paper_ids:
    return {}
  from sqlalchemy.orm import selectinload

  result = await session.execute(
    select(PaperShare)
    .where(PaperShare.recipient_id == user_id, PaperShare.paper_id.in_(paper_ids))
    .options(selectinload(PaperShare.shared_by))
  )
  return {cast(int, s.paper_id): s for s in result.scalars().all()}


router = APIRouter()


@router.get("/search/capabilities", response_model=SearchCapabilities)
async def search_capabilities(user: CurrentUser):
  """Report whether semantic search is functional on this server."""
  available = embedding_service.is_available()
  return SearchCapabilities(
    semantic_available=available,
    reason=None if available else "No server embedding key configured",
  )


@router.post("/search", response_model=SearchResponse)
async def semantic_search(
  search_request: SearchRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  if not search_request.query or not search_request.query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  if not embedding_service.is_available():
    # No server embedding key — a zero query vector would return garbage
    # rankings. Return empty results with an explicit degradation signal so
    # the UI can tell the user and fall back to full-text search.
    return SearchResponse(
      results=[],
      query=search_request.query,
      total=0,
      semantic_available=False,
    )

  query_embedding = await embedding_service.generate_query_embedding(
    search_request.query
  )
  similarity_threshold = search_request.threshold or 0.0

  vector_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

  uid = scoped_user_id(user)
  user_filter = "AND uploaded_by_id = :user_id" if uid is not None else ""

  query_sql = text(f"""
        SELECT
            id,
            1 - (embedding <=> '{vector_str}'::vector) as similarity
        FROM papers
        WHERE embedding IS NOT NULL
        {user_filter}
        AND (1 - (embedding <=> '{vector_str}'::vector)) >= :threshold
        ORDER BY embedding <=> '{vector_str}'::vector
        LIMIT :limit
    """)

  params: dict = {"threshold": similarity_threshold, "limit": search_request.limit}
  if uid is not None:
    params["user_id"] = uid

  result = await session.execute(query_sql, params)
  rows = result.fetchall()

  if not rows:
    return SearchResponse(results=[], query=search_request.query, total=0)

  paper_ids = [row[0] for row in rows]
  similarity_scores = {row[0]: row[-1] for row in rows}

  papers_query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id.in_(paper_ids))
  )
  papers_result = await session.execute(papers_query)
  papers = list(papers_result.scalars().all())

  user_states = await _fetch_user_states(session, uid, paper_ids)
  user_shares = await _fetch_share_info(session, uid, paper_ids)

  filtered_papers = []
  for paper in papers:
    include = True
    state = user_states.get(cast(int, paper.id))

    if search_request.reading_status:
      paper_status = state.reading_status if state else "not_started"
      if paper_status != search_request.reading_status:
        include = False
    if search_request.priority:
      paper_priority = state.priority if state else "low"
      if paper_priority != search_request.priority:
        include = False
    if search_request.has_annotations is not None:
      has_anns = len(getattr(paper, "annotations", [])) > 0
      if search_request.has_annotations != has_anns:
        include = False

    if include:
      filtered_papers.append(paper)

  results = [
    SearchResult(
      paper=_enrich_paper(
        paper,
        user_states.get(cast(int, paper.id)),
        user_id=uid,
        share=user_shares.get(cast(int, paper.id)),
      ),
      similarity=_sanitize_similarity(similarity_scores.get(paper.id, 0.0)),
    )
    for paper in filtered_papers
    if paper.id in similarity_scores
  ]
  results.sort(key=lambda x: x.similarity, reverse=True)

  return SearchResponse(results=results, query=search_request.query, total=len(results))


@router.post("/search/fulltext", response_model=SearchResponse)
async def fulltext_search(
  search_request: SearchRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  if not search_request.query or not search_request.query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  papers = await search_service.fulltext_search(
    session, search_request.query, search_request.limit, user_id=scoped_user_id(user)
  )

  uid = scoped_user_id(user)
  ft_paper_ids = [cast(int, p.id) for p in papers]
  ft_states = await _fetch_user_states(session, uid, ft_paper_ids)
  ft_shares = await _fetch_share_info(session, uid, ft_paper_ids)

  results = [
    SearchResult(
      paper=_enrich_paper(
        paper,
        ft_states.get(cast(int, paper.id)),
        user_id=uid,
        share=ft_shares.get(cast(int, paper.id)),
      ),
      similarity=1.0,
    )
    for paper in papers
  ]

  return SearchResponse(results=results, query=search_request.query, total=len(results))


@router.post("/search/annotations")
async def search_annotations(
  query: str,
  user: CurrentUser,
  limit: int = 10,
  session: AsyncSession = Depends(get_db),
):
  if not query or not query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  annotations = await search_service.search_annotations(
    session, query, limit, user_id=scoped_user_id(user)
  )

  return {
    "annotations": [
      {
        "id": ann.id,
        "paper_id": ann.paper_id,
        "content": ann.content,
        "highlighted_text": ann.highlighted_text,
      }
      for ann in annotations
    ],
    "total": len(annotations),
  }


@router.get("/saved-searches", response_model=list[SavedSearchResponse])
async def list_saved_searches_endpoint(
  user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  searches = await list_saved_searches(session, user_id=scoped_user_id(user))
  return [SavedSearchResponse.model_validate(s) for s in searches]


@router.post("/saved-searches", response_model=SavedSearchResponse, status_code=201)
async def create_saved_search_endpoint(
  search_create: SavedSearchCreate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  saved_search = await create_saved_search(
    session,
    search_create.name,
    user_id=scoped_user_id(user),
    description=search_create.description,
    query_params=search_create.query_params,
  )
  return SavedSearchResponse.model_validate(saved_search)


@router.delete("/saved-searches/{search_id}", status_code=204)
async def delete_saved_search_endpoint(
  search_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  await delete_saved_search(session, search_id, user_id=scoped_user_id(user))
  return None
