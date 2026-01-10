from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.paper import Paper
from app.models.saved_search import SavedSearch
from app.schemas.paper import Paper as PaperSchema
from app.schemas.search import (
  SavedSearchCreate,
  SavedSearchResponse,
  SearchRequest,
  SearchResponse,
  SearchResult,
)
from app.services.embeddings import embedding_service
from app.services.search_service import search_service

router = APIRouter()


@router.post("/search", response_model=SearchResponse)
async def semantic_search(
  search_request: SearchRequest, session: AsyncSession = Depends(get_db)
):
  if not search_request.query or not search_request.query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  query_embedding = embedding_service.generate_embedding(search_request.query)
  similarity_threshold = search_request.threshold or 0.0

  from sqlalchemy import text

  vector_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

  query_sql = text(f"""
        SELECT 
            id,
            title,
            doi,
            url,
            file_path,
            content_text,
            metadata_json,
            created_at,
            updated_at,
            1 - (embedding <=> '{vector_str}'::vector) as similarity
        FROM papers
        WHERE embedding IS NOT NULL
        AND (1 - (embedding <=> '{vector_str}'::vector)) >= :threshold
        ORDER BY embedding <=> '{vector_str}'::vector
        LIMIT :limit
    """)

  result = await session.execute(
    query_sql,
    {
      "threshold": similarity_threshold,
      "limit": search_request.limit,
    },
  )

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
  papers = papers_result.scalars().all()

  # Filter papers by additional criteria if provided
  filtered_papers = []
  for paper in papers:
    # Apply basic filters manually since we already have paper_ids from semantic search
    include = True

    # Reading status filter
    if (
      search_request.reading_status
      and getattr(paper, "reading_status", None) != search_request.reading_status
    ):
      include = False
    # Priority filter
    if (
      search_request.priority
      and getattr(paper, "priority", None) != search_request.priority
    ):
      include = False
    # Has annotations filter
    if search_request.has_annotations is not None:
      has_anns = len(getattr(paper, "annotations", [])) > 0
      if search_request.has_annotations != has_anns:
        include = False

    if include:
      filtered_papers.append(paper)

  results = [
    SearchResult(
      paper=PaperSchema.model_validate(paper),
      similarity=float(similarity_scores.get(paper.id, 0.0)),
    )
    for paper in filtered_papers
    if paper.id in similarity_scores
  ]

  results.sort(key=lambda x: x.similarity, reverse=True)

  return SearchResponse(results=results, query=search_request.query, total=len(results))


@router.post("/search/fulltext", response_model=SearchResponse)
async def fulltext_search(
  search_request: SearchRequest, session: AsyncSession = Depends(get_db)
):
  """Full-text search endpoint."""
  if not search_request.query or not search_request.query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  papers = await search_service.fulltext_search(
    session, search_request.query, search_request.limit
  )

  results = [
    SearchResult(paper=PaperSchema.model_validate(paper), similarity=1.0)
    for paper in papers
  ]

  return SearchResponse(results=results, query=search_request.query, total=len(results))


@router.post("/search/annotations")
async def search_annotations(
  query: str, limit: int = 10, session: AsyncSession = Depends(get_db)
):
  """Search within annotations."""
  if not query or not query.strip():
    raise HTTPException(status_code=400, detail="Query cannot be empty")

  annotations = await search_service.search_annotations(session, query, limit)

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
async def list_saved_searches(session: AsyncSession = Depends(get_db)):
  """List all saved searches."""
  query = select(SavedSearch).order_by(SavedSearch.created_at.desc())
  result = await session.execute(query)
  searches = result.scalars().all()
  return [SavedSearchResponse.model_validate(search) for search in searches]


@router.post("/saved-searches", response_model=SavedSearchResponse, status_code=201)
async def create_saved_search(
  search_create: SavedSearchCreate, session: AsyncSession = Depends(get_db)
):
  """Create a saved search."""
  saved_search = SavedSearch(
    name=search_create.name,
    description=search_create.description,
    query_params=search_create.query_params,
  )
  session.add(saved_search)
  await session.commit()
  await session.refresh(saved_search)
  return SavedSearchResponse.model_validate(saved_search)


@router.delete("/saved-searches/{search_id}", status_code=204)
async def delete_saved_search(search_id: int, session: AsyncSession = Depends(get_db)):
  """Delete a saved search."""
  query = select(SavedSearch).where(SavedSearch.id == search_id)
  result = await session.execute(query)
  saved_search = result.scalar_one_or_none()

  if not saved_search:
    raise HTTPException(status_code=404, detail="Saved search not found")

  await session.delete(saved_search)
  await session.commit()
  return None
