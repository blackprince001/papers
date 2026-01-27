"""Papers API endpoints."""

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud import (
  create_bookmark,
  delete_bookmark,
  delete_paper,
  delete_papers_bulk,
  get_paper_or_404,
  increment_view_count,
  list_bookmarks_for_paper,
  update_paper,
  update_priority,
  update_reading_status,
)
from app.api.crud.utils import ensure_loaded, sanitize_metadata
from app.core.logger import get_logger
from app.dependencies import get_db
from app.models.paper import Paper
from app.models.reading_session import ReadingSession
from app.schemas.paper import (
  BulkRegenerateRequest,
  BulkRegenerateResponse,
  PaperListResponse,
  PaperUpdate,
)
from app.schemas.paper import (
  Paper as PaperSchema,
)
from app.schemas.reading_progress import (
  BookmarkCreate,
  BookmarkResponse,
  PaperReadingProgress,
  PriorityUpdate,
  ReadingSessionResponse,
  ReadingSessionUpdate,
  ReadingStatusUpdate,
)
from app.schemas.related import RelatedPapersResponse
from app.services.citation_extractor import citation_extractor
from app.services.ingestion import sanitize_text
from app.services.pdf_parser import pdf_parser
from app.services.reading_tracker import reading_tracker_service
from app.services.references import reference_formatter
from app.services.semantic_scholar import semantic_scholar_service

logger = get_logger(__name__)

router = APIRouter()


@router.get("/papers", response_model=PaperListResponse)
async def list_papers_endpoint(
  page: int = Query(1, ge=1),
  page_size: int = Query(20, ge=1, le=100),
  search: Optional[str] = None,
  sort_by: Optional[str] = Query(
    "date_added", pattern="^(date_added|viewed|title|authors)$"
  ),
  sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
  group_id: Optional[int] = None,
  tag_id: Optional[int] = None,
  has_file: Optional[bool] = None,
  date_from: Optional[str] = None,
  date_to: Optional[str] = None,
  session: AsyncSession = Depends(get_db),
):
  """List papers with filtering and pagination."""
  # Build base query with eager loading
  from sqlalchemy import func, or_

  from app.models.paper import paper_group_association
  from app.models.tag import paper_tag_association

  query = select(Paper).options(
    selectinload(Paper.annotations),
    selectinload(Paper.groups),
    selectinload(Paper.tags),
  )

  # Apply filters
  if search:
    query = query.where(
      or_(
        Paper.title.ilike(f"%{search}%"),
        Paper.content_text.ilike(f"%{search}%"),
      )
    )

  if group_id is not None:
    query = query.join(paper_group_association).where(
      paper_group_association.c.group_id == group_id
    )

  if tag_id is not None:
    query = query.join(paper_tag_association).where(
      paper_tag_association.c.tag_id == tag_id
    )

  if has_file is not None:
    if has_file:
      query = query.where(Paper.file_path.isnot(None))
    else:
      query = query.where(Paper.file_path.is_(None))

  if date_from:
    try:
      date_from_obj = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
      query = query.where(Paper.created_at >= date_from_obj)
    except ValueError:
      pass

  if date_to:
    try:
      date_to_obj = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
      query = query.where(Paper.created_at <= date_to_obj)
    except ValueError:
      pass

  # Count (simplified - match main query filters)
  count_query = select(func.count()).select_from(query.subquery())
  total_result = await session.execute(count_query)
  total = total_result.scalar() or 0

  # Apply sorting
  sort_column = {
    "date_added": Paper.created_at,
    "viewed": Paper.viewed_count,
    "title": Paper.title,
    "authors": Paper.title,  # Fallback for metadata-based sort
  }.get(sort_by, Paper.created_at)

  if sort_order == "asc":
    query = query.order_by(sort_column.asc())
  else:
    query = query.order_by(sort_column.desc())

  # Paginate
  offset = (page - 1) * page_size
  query = query.offset(offset).limit(page_size)

  result = await session.execute(query)
  papers = list(result.scalars().all())

  for paper in papers:
    ensure_loaded(paper, "tags", "groups")

  # Python-side sort for authors since it's in metadata_json
  if sort_by == "authors":
    papers_list = [PaperSchema.model_validate(p) for p in papers]
    papers_list.sort(
      key=lambda p: (p.metadata_json or {}).get("authors", "") or "",
      reverse=(sort_order == "desc"),
    )
    return PaperListResponse(
      papers=papers_list, total=total, page=page, page_size=page_size
    )

  return PaperListResponse(
    papers=[PaperSchema.model_validate(p) for p in papers],
    total=total,
    page=page,
    page_size=page_size,
  )


@router.get("/papers/{paper_id}", response_model=PaperSchema)
async def get_paper_endpoint(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get a single paper by ID."""
  paper = await increment_view_count(session, paper_id)
  return PaperSchema.model_validate(paper)


@router.patch("/papers/{paper_id}", response_model=PaperSchema)
async def update_paper_endpoint(
  paper_id: int, paper_update: PaperUpdate, session: AsyncSession = Depends(get_db)
):
  """Update a paper."""
  paper = await update_paper(
    session,
    paper_id,
    title=paper_update.title,
    doi=paper_update.doi,
    metadata_json=paper_update.metadata_json,
    group_ids=paper_update.group_ids,
    tag_ids=paper_update.tag_ids,
  )
  return PaperSchema.model_validate(paper)


@router.delete("/papers/{paper_id}", status_code=204)
async def delete_paper_endpoint(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Delete a paper."""
  await delete_paper(session, paper_id)
  return None


@router.delete("/papers", status_code=204)
async def delete_papers_bulk_endpoint(
  paper_ids: list[int] = Query(..., description="List of paper IDs to delete"),
  session: AsyncSession = Depends(get_db),
):
  """Delete multiple papers by ID."""
  await delete_papers_bulk(session, paper_ids)
  return None


@router.get("/papers/{paper_id}/reference")
async def get_paper_reference(
  paper_id: int,
  format: str = Query("apa", pattern="^(apa|mla|bibtex)$"),
  session: AsyncSession = Depends(get_db),
):
  """Get formatted reference for a paper."""
  paper = await get_paper_or_404(session, paper_id)

  formatter = {
    "apa": reference_formatter.format_apa,
    "mla": reference_formatter.format_mla,
    "bibtex": reference_formatter.format_bibtex,
  }.get(format)

  if not formatter:
    raise HTTPException(status_code=400, detail="Invalid format")

  return {"format": format, "reference": formatter(paper)}


@router.get("/papers/{paper_id}/related", response_model=RelatedPapersResponse)
async def get_related_papers(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get related papers from library and external sources."""
  paper = await get_paper_or_404(session, paper_id, with_relations=True)

  related_library = []
  cited_by = []
  cited_here = []
  related_internet = []

  # Related in Library (Vector Similarity)
  try:
    if paper.embedding is not None:
      vector_str = "[" + ",".join(str(x) for x in paper.embedding) + "]"
      similarity_query = text(f"""
        SELECT id, 1 - (embedding <=> '{vector_str}'::vector) as similarity
        FROM papers
        WHERE id != :paper_id AND embedding IS NOT NULL
        ORDER BY embedding <=> '{vector_str}'::vector
        LIMIT 5
      """)
      sim_result = await session.execute(similarity_query, {"paper_id": paper_id})
      rows = sim_result.fetchall()

      if rows:
        lib_ids = [row[0] for row in rows]
        lib_papers_query = (
          select(Paper)
          .options(
            selectinload(Paper.annotations),
            selectinload(Paper.groups),
            selectinload(Paper.tags),
          )
          .where(Paper.id.in_(lib_ids))
        )
        lib_papers_result = await session.execute(lib_papers_query)
        lib_papers = {p.id: p for p in lib_papers_result.scalars().all()}

        for p in lib_papers.values():
          ensure_loaded(p, "tags")

        related_library = [
          PaperSchema.model_validate(lib_papers[pid])
          for pid in lib_ids
          if pid in lib_papers
        ]
  except Exception as e:
    logger.error("Error fetching related papers from library", error=str(e))

  # External API (Semantic Scholar)
  try:
    arxiv_id = None
    if paper.doi and paper.doi.startswith("arxiv:"):
      arxiv_id = paper.doi.replace("arxiv:", "")
      doi_val = None
    else:
      doi_val = paper.doi

    identifier = semantic_scholar_service._get_identifier(
      doi=cast(str, doi_val), arxiv=arxiv_id
    )

    if not identifier and paper.title:
      try:
        identifier = await semantic_scholar_service.search_paper(str(paper.title))
      except Exception:
        pass

    if identifier:
      results = await asyncio.gather(
        semantic_scholar_service.get_citations(identifier, limit=5),
        semantic_scholar_service.get_references(identifier, limit=5),
        semantic_scholar_service.get_recommendations(identifier, limit=5),
        return_exceptions=True,
      )
      if not isinstance(results[0], Exception):
        cited_by = results[0] or []
      if not isinstance(results[1], Exception):
        cited_here = results[1] or []
      if not isinstance(results[2], Exception):
        related_internet = results[2] or []
  except Exception as e:
    logger.error("Error fetching from external API", error=str(e))

  return RelatedPapersResponse(
    cited_by=cited_by,
    cited_here=cited_here,
    related_library=related_library,
    related_internet=related_internet,
  )


@router.post("/papers/{paper_id}/regenerate-metadata", response_model=PaperSchema)
async def regenerate_paper_metadata(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """Regenerate metadata for a paper using AI extraction."""
  paper = await get_paper_or_404(session, paper_id, with_relations=True)

  if not paper.file_path:
    raise HTTPException(status_code=400, detail="Paper has no associated PDF file")

  file_path = Path(cast(str, paper.file_path))
  if not file_path.exists():
    raise HTTPException(
      status_code=404, detail=f"PDF file not found at {paper.file_path}"
    )

  try:
    with open(file_path, "rb") as f:
      pdf_content = f.read()

    metadata = await pdf_parser.extract_metadata(pdf_content)
    metadata = sanitize_metadata(metadata)

    if metadata.get("title") and len(metadata.get("title", "").strip()) > 0:
      paper.title = sanitize_text(metadata["title"].strip())

    paper.metadata_json = metadata
    paper.volume = metadata.get("volume") or None
    paper.issue = metadata.get("issue") or None
    paper.pages = metadata.get("pages") or None

    if metadata.get("doi"):
      paper.doi = metadata["doi"].strip()

    await session.commit()
    await session.refresh(paper, ["groups", "tags"])
    ensure_loaded(paper, "tags", "groups")

    return PaperSchema.model_validate(paper)

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Error regenerating metadata: {str(e)}"
    ) from e


@router.post("/papers/regenerate-metadata-bulk", response_model=BulkRegenerateResponse)
async def regenerate_paper_metadata_bulk(
  request: BulkRegenerateRequest, session: AsyncSession = Depends(get_db)
):
  """Regenerate metadata for multiple papers."""
  successful = []
  failed = []

  for paper_id in request.paper_ids:
    try:
      query = (
        select(Paper).where(Paper.id == paper_id).options(selectinload(Paper.tags))
      )
      result = await session.execute(query)
      paper = result.scalar_one_or_none()

      if not paper:
        failed.append({"paper_id": paper_id, "error": "Paper not found"})
        continue

      if not paper.file_path:
        failed.append({"paper_id": paper_id, "error": "No PDF file"})
        continue

      file_path = Path(cast(str, paper.file_path))
      if not file_path.exists():
        failed.append({"paper_id": paper_id, "error": "PDF file not found"})
        continue

      with open(file_path, "rb") as f:
        pdf_content = f.read()

      metadata = await pdf_parser.extract_metadata(pdf_content)
      metadata = sanitize_metadata(metadata)

      if metadata.get("title"):
        paper.title = sanitize_text(metadata["title"].strip())

      paper.metadata_json = metadata
      paper.volume = metadata.get("volume") or None
      paper.issue = metadata.get("issue") or None
      paper.pages = metadata.get("pages") or None

      if metadata.get("doi"):
        paper.doi = metadata["doi"].strip()

      await session.commit()
      successful.append(paper_id)

    except Exception as e:
      failed.append({"paper_id": paper_id, "error": str(e)})

  return BulkRegenerateResponse(successful=successful, failed=failed)


@router.post("/papers/{paper_id}/extract-citations")
async def extract_paper_citations(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """Extract and store citations from a paper's PDF."""
  paper = await get_paper_or_404(session, paper_id)

  if not paper.file_path:
    raise HTTPException(status_code=400, detail="Paper has no associated PDF file")

  file_path = Path(cast(str, paper.file_path))
  if not file_path.exists():
    raise HTTPException(
      status_code=404, detail=f"PDF file not found at {paper.file_path}"
    )

  try:
    with open(file_path, "rb") as f:
      pdf_content = f.read()

    citation_count = await citation_extractor.extract_and_store_citations(
      session, paper_id, pdf_content
    )
    return {"paper_id": paper_id, "citations_extracted": citation_count}

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Error extracting citations: {str(e)}"
    ) from e


@router.patch("/papers/{paper_id}/reading-status", response_model=PaperSchema)
async def update_reading_status_endpoint(
  paper_id: int,
  status_update: ReadingStatusUpdate,
  session: AsyncSession = Depends(get_db),
):
  """Update reading status for a paper."""
  paper = await update_reading_status(session, paper_id, status_update.reading_status)
  return PaperSchema.model_validate(paper)


@router.patch("/papers/{paper_id}/priority", response_model=PaperSchema)
async def update_priority_endpoint(
  paper_id: int,
  priority_update: PriorityUpdate,
  session: AsyncSession = Depends(get_db),
):
  """Update priority for a paper."""
  paper = await update_priority(session, paper_id, priority_update.priority)
  return PaperSchema.model_validate(paper)


@router.get("/papers/{paper_id}/reading-progress", response_model=PaperReadingProgress)
async def get_reading_progress(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get reading progress for a paper."""
  paper = await get_paper_or_404(session, paper_id)

  return PaperReadingProgress(
    paper_id=cast(int, paper.id),
    reading_status=cast(str, paper.reading_status),
    reading_time_minutes=cast(int, paper.reading_time_minutes) or 0,
    last_read_page=cast(int, paper.last_read_page),
    priority=cast(str, paper.priority),
    status_updated_at=cast(datetime | None, paper.status_updated_at),
    last_read_at=cast(datetime | None, paper.last_read_at),
  )


@router.post(
  "/papers/{paper_id}/reading-session/start", response_model=ReadingSessionResponse
)
async def start_reading_session(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Start a reading session for a paper."""
  paper = await get_paper_or_404(session, paper_id)

  if paper.reading_status == "not_started":
    paper.reading_status = "in_progress"
    paper.status_updated_at = datetime.now(timezone.utc)

  reading_session = ReadingSession(
    paper_id=paper_id,
    start_time=datetime.now(timezone.utc),
    duration_minutes=0,
    pages_viewed=0,
  )
  session.add(reading_session)
  await session.commit()
  await session.refresh(reading_session)

  return ReadingSessionResponse.model_validate(reading_session)


@router.post(
  "/papers/{paper_id}/reading-session/end", response_model=ReadingSessionResponse
)
async def end_reading_session(
  paper_id: int,
  session_update: ReadingSessionUpdate,
  session: AsyncSession = Depends(get_db),
):
  """End a reading session for a paper."""
  query = (
    select(ReadingSession)
    .where(ReadingSession.paper_id == paper_id)
    .where(ReadingSession.end_time.is_(None))
    .order_by(ReadingSession.start_time.desc())
    .limit(1)
  )
  result = await session.execute(query)
  reading_session = result.scalar_one_or_none()

  if not reading_session:
    raise HTTPException(status_code=404, detail="No active reading session found")

  now = datetime.now(timezone.utc)
  reading_session.end_time = session_update.end_time or now

  if session_update.duration_minutes is None:
    duration = (
      reading_session.end_time - reading_session.start_time
    ).total_seconds() / 60
    reading_session.duration_minutes = int(duration)
  else:
    reading_session.duration_minutes = session_update.duration_minutes

  if session_update.pages_viewed is not None:
    reading_session.pages_viewed = session_update.pages_viewed

  paper = await get_paper_or_404(session, paper_id)
  total_minutes = await reading_tracker_service.aggregate_reading_time(
    session, paper_id
  )
  paper.reading_time_minutes = total_minutes
  paper.last_read_at = now

  if session_update.last_read_page is not None:
    paper.last_read_page = session_update.last_read_page

  await session.commit()
  await session.refresh(reading_session)

  return ReadingSessionResponse.model_validate(reading_session)


@router.get("/papers/{paper_id}/bookmarks", response_model=list[BookmarkResponse])
async def list_bookmarks_endpoint(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """List all bookmarks for a paper."""
  bookmarks = await list_bookmarks_for_paper(session, paper_id)
  return [BookmarkResponse.model_validate(b) for b in bookmarks]


@router.post(
  "/papers/{paper_id}/bookmarks", response_model=BookmarkResponse, status_code=201
)
async def create_bookmark_endpoint(
  paper_id: int,
  bookmark_create: BookmarkCreate,
  session: AsyncSession = Depends(get_db),
):
  """Create a bookmark for a paper."""
  bookmark = await create_bookmark(
    session, paper_id, bookmark_create.page_number, bookmark_create.note
  )
  return BookmarkResponse.model_validate(bookmark)


@router.delete("/papers/{paper_id}/bookmarks/{bookmark_id}", status_code=204)
async def delete_bookmark_endpoint(
  paper_id: int, bookmark_id: int, session: AsyncSession = Depends(get_db)
):
  """Delete a bookmark."""
  await delete_bookmark(session, bookmark_id, paper_id)
  return None
