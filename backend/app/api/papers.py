from datetime import datetime, timezone
from typing import Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logger import get_logger
from app.dependencies import get_db
from app.models.bookmark import Bookmark
from app.models.paper import Paper
from app.models.reading_session import ReadingSession
from app.schemas.paper import Paper as PaperSchema
from app.schemas.paper import PaperListResponse, PaperUpdate
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
async def list_papers(
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
  query = select(Paper).options(
    selectinload(Paper.annotations),
    selectinload(Paper.groups),
    selectinload(Paper.tags),
  )

  # Apply search filter
  if search:
    query = query.where(
      or_(
        Paper.title.ilike(f"%{search}%"),
        Paper.content_text.ilike(f"%{search}%"),
      )
    )

  # Apply group filter
  if group_id is not None:
    from app.models.paper import paper_group_association

    query = query.join(paper_group_association).where(
      paper_group_association.c.group_id == group_id
    )

  # Apply tag filter
  if tag_id is not None:
    from app.models.tag import paper_tag_association

    query = query.join(paper_tag_association).where(
      paper_tag_association.c.tag_id == tag_id
    )

  # Apply has_file filter
  if has_file is not None:
    if has_file:
      query = query.where(Paper.file_path.isnot(None))
    else:
      query = query.where(Paper.file_path.is_(None))

  # Apply date range filter
  if date_from:
    try:
      date_from_obj = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
      query = query.where(Paper.created_at >= date_from_obj)
    except ValueError:
      pass  # Invalid date format, ignore

  if date_to:
    try:
      date_to_obj = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
      query = query.where(Paper.created_at <= date_to_obj)
    except ValueError:
      pass  # Invalid date format, ignore

  # Build count query with same filters
  count_query = select(func.count()).select_from(Paper)
  if search:
    count_query = count_query.where(
      or_(
        Paper.title.ilike(f"%{search}%"),
        Paper.content_text.ilike(f"%{search}%"),
      )
    )
  if group_id is not None:
    from app.models.paper import paper_group_association as pga

    count_query = count_query.join(pga).where(pga.c.group_id == group_id)
  if tag_id is not None:
    from app.models.tag import paper_tag_association as pta

    count_query = count_query.join(pta).where(pta.c.tag_id == tag_id)
  if has_file is not None:
    if has_file:
      count_query = count_query.where(Paper.file_path.isnot(None))
    else:
      count_query = count_query.where(Paper.file_path.is_(None))
  if date_from:
    try:
      date_from_obj = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
      count_query = count_query.where(Paper.created_at >= date_from_obj)
    except ValueError:
      pass
  if date_to:
    try:
      date_to_obj = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
      count_query = count_query.where(Paper.created_at <= date_to_obj)
    except ValueError:
      pass

  total_result = await session.execute(count_query)
  total = total_result.scalar()

  # Apply sorting
  sort_column = None
  if sort_by == "date_added":
    sort_column = Paper.created_at
  elif sort_by == "viewed":
    sort_column = Paper.viewed_count
  elif sort_by == "title":
    sort_column = Paper.title
  elif sort_by == "authors":
    # For authors, we'll sort by title as a fallback since authors is in metadata_json
    sort_column = Paper.title

  if sort_column:
    if sort_order == "asc":
      query = query.order_by(sort_column.asc())
    else:
      query = query.order_by(sort_column.desc())
  else:
    # Default sorting
    query = query.order_by(Paper.created_at.desc())

  offset = (page - 1) * page_size
  query = query.offset(offset).limit(page_size)

  result = await session.execute(query)
  papers = result.scalars().all()

  # Ensure tags are loaded by accessing them while session is active
  for paper in papers:
    # Access tags to trigger eager loading - this ensures they're loaded before serialization
    _ = list(paper.tags) if hasattr(paper, "tags") else []

  # If sorting by authors, sort in Python since it's in metadata_json
  if sort_by == "authors":
    papers_list = [PaperSchema.model_validate(p) for p in papers]
    papers_list.sort(
      key=lambda p: (p.metadata_json or {}).get("authors", "") or "",
      reverse=(sort_order == "desc"),
    )
    return PaperListResponse(
      papers=papers_list,
      total=total,
      page=page,
      page_size=page_size,
    )

  return PaperListResponse(
    papers=[PaperSchema.model_validate(p) for p in papers],
    total=total,
    page=page,
    page_size=page_size,
  )


@router.get("/papers/{paper_id}", response_model=PaperSchema)
async def get_paper(paper_id: int, session: AsyncSession = Depends(get_db)):
  query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == paper_id)
  )

  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  # Increment view count
  paper.viewed_count = (paper.viewed_count or 0) + 1
  await session.commit()

  return PaperSchema.model_validate(paper)


@router.get("/papers/{paper_id}/reference")
async def get_paper_reference(
  paper_id: int,
  format: str = Query("apa", pattern="^(apa|mla|bibtex)$"),
  session: AsyncSession = Depends(get_db),
):
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if format == "apa":
    reference = reference_formatter.format_apa(paper)
  elif format == "mla":
    reference = reference_formatter.format_mla(paper)
  elif format == "bibtex":
    reference = reference_formatter.format_bibtex(paper)
  else:
    raise HTTPException(
      status_code=400, detail="Invalid format. Use 'apa', 'mla', or 'bibtex'"
    )

  return {"format": format, "reference": reference}


@router.delete("/papers/{paper_id}", status_code=204)
async def delete_paper(paper_id: int, session: AsyncSession = Depends(get_db)):
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  # Delete the PDF file if it exists
  if paper.file_path and isinstance(paper.file_path, str):
    try:
      from pathlib import Path

      file_path = Path(paper.file_path)
      if file_path.exists():
        file_path.unlink()
    except Exception:
      pass  # Continue even if file deletion fails

  await session.delete(paper)
  await session.commit()

  return None


@router.delete("/papers", status_code=204)
async def delete_papers_bulk(
  paper_ids: list[int] = Query(..., description="List of paper IDs to delete"),
  session: AsyncSession = Depends(get_db),
):
  """Delete multiple papers by ID."""
  if not paper_ids:
    raise HTTPException(status_code=400, detail="No paper IDs provided")

  # Fetch all papers at once
  query = select(Paper).where(Paper.id.in_(paper_ids))
  result = await session.execute(query)
  papers = result.scalars().all()

  if len(papers) != len(paper_ids):
    found_ids = {p.id for p in papers}
    missing_ids = set(paper_ids) - found_ids
    raise HTTPException(
      status_code=404, detail=f"Papers not found: {sorted(missing_ids)}"
    )

  # Delete PDF files
  from pathlib import Path

  for paper in papers:
    if paper.file_path and isinstance(paper.file_path, str):
      try:
        file_path = Path(paper.file_path)
        if file_path.exists():
          file_path.unlink()
      except Exception:
        pass  # Continue even if file deletion fails

  # Delete papers
  for paper in papers:
    await session.delete(paper)

  await session.commit()
  return None


@router.patch("/papers/{paper_id}", response_model=PaperSchema)
async def update_paper(
  paper_id: int, paper_update: PaperUpdate, session: AsyncSession = Depends(get_db)
):
  query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == paper_id)
  )
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if paper_update.title is not None:
    paper.title = paper_update.title
  if paper_update.doi is not None:
    paper.doi = paper_update.doi
  if paper_update.metadata_json is not None:
    paper.metadata_json = paper_update.metadata_json

  if paper_update.group_ids is not None:
    from app.models.group import Group

    groups_query = select(Group).where(Group.id.in_(paper_update.group_ids))
    groups_result = await session.execute(groups_query)
    paper.groups = groups_result.scalars().all()

  if paper_update.tag_ids is not None:
    from app.models.tag import Tag

    tags_query = select(Tag).where(Tag.id.in_(paper_update.tag_ids))
    tags_result = await session.execute(tags_query)
    paper.tags = tags_result.scalars().all()

  await session.commit()
  await session.refresh(paper, ["groups", "tags"])

  # Ensure tags are loaded by accessing them while session is active
  _ = list(paper.tags) if hasattr(paper, "tags") else []

  return PaperSchema.model_validate(paper)


@router.get("/papers/{paper_id}/related", response_model=RelatedPapersResponse)
async def get_related_papers(paper_id: int, session: AsyncSession = Depends(get_db)):
  # Initialize default values
  related_library = []
  cited_by = []
  cited_here = []
  related_internet = []

  try:
    # 1. Fetch current paper
    query = select(Paper).where(Paper.id == paper_id)
    result = await session.execute(query)
    paper = result.scalar_one_or_none()

    if not paper:
      raise HTTPException(status_code=404, detail="Paper not found")

    # 2. Related in Library (Vector Similarity)
    try:
      if paper.embedding is not None:
        from sqlalchemy import text

      vector_str = "[" + ",".join(str(x) for x in paper.embedding) + "]"
      similarity_query = text(
        f"""
              SELECT id, 1 - (embedding <=> '{vector_str}'::vector) as similarity
              FROM papers
              WHERE id != :paper_id AND embedding IS NOT NULL
              ORDER BY embedding <=> '{vector_str}'::vector
              LIMIT 5
          """
      )
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

        # Ensure tags are loaded by accessing them while session is active
        for p in lib_papers.values():
          _ = list(p.tags) if hasattr(p, "tags") else []

        # Maintain order from similarity search
        related_library = [
          PaperSchema.model_validate(lib_papers[pid])
          for pid in lib_ids
          if pid in lib_papers
        ]
    except Exception as e:
      logger.error(
        "Error fetching related papers from library", paper_id=paper_id, error=str(e)
      )

    # 3. External API Calls (Semantic Scholar)
    try:
      # Determine identifier
      arxiv_id = None
      if paper.doi and paper.doi.startswith("arxiv:"):
        arxiv_id = paper.doi.replace("arxiv:", "")
        doi_val = None
      else:
        doi_val = paper.doi

      identifier = semantic_scholar_service._get_identifier(
        doi=cast(str, doi_val), arxiv=arxiv_id
      )

      # Fallback to title search if no identifier found
      if not identifier:
        try:
          identifier = await semantic_scholar_service.search_paper(str(paper.title))
        except Exception as e:
          logger.error("Error searching paper by title", error=str(e))

      if identifier:
        import asyncio

        try:
          # Run external API calls in parallel
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
          logger.error(
            "Error fetching from external API", identifier=identifier, error=str(e)
          )

    except Exception as e:
      logger.error("Error in external API section", paper_id=paper_id, error=str(e))

  except HTTPException:
    raise
  except Exception as e:
    logger.error(
      "Unexpected error in get_related_papers", paper_id=paper_id, error=str(e)
    )

  return RelatedPapersResponse(
    cited_by=cited_by or [],
    cited_here=cited_here or [],
    related_library=related_library or [],
    related_internet=related_internet or [],
  )


@router.post("/papers/{paper_id}/regenerate-metadata", response_model=PaperSchema)
async def regenerate_paper_metadata(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """Regenerate metadata for a paper using AI-structured extraction."""
  query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == paper_id)
  )
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.file_path:
    raise HTTPException(status_code=400, detail="Paper has no associated PDF file")

  try:
    # Load PDF file
    from pathlib import Path

    file_path = Path(cast(str, paper.file_path))
    if not file_path.exists():
      raise HTTPException(
        status_code=404, detail=f"PDF file not found at {paper.file_path}"
      )

    with open(file_path, "rb") as f:
      pdf_content = f.read()

    # Regenerate metadata using AI extraction
    metadata = await pdf_parser.extract_metadata(pdf_content)

    if metadata:
      sanitized_metadata = {}
      for key, value in metadata.items():
        if isinstance(value, str):
          sanitized_metadata[key] = sanitize_text(value)
        elif isinstance(value, list):
          sanitized_metadata[key] = [
            sanitize_text(item) if isinstance(item, str) else item
            for item in value
          ]
        else:
          sanitized_metadata[key] = value
      metadata = sanitized_metadata

    # Update paper with new metadata (replace all)
    # Update title if new title is available and valid
    if (
      metadata and metadata.get("title") and len(metadata.get("title", "").strip()) > 0
    ):
      t = metadata.get("title")

      paper.title = sanitize_text(t.strip() if t else "")

    # Update metadata_json completely
    paper.metadata_json = metadata or {}

    # Update direct columns from metadata
    volume = metadata.get("volume") if metadata else None
    issue = metadata.get("issue") if metadata else None
    pages = metadata.get("pages") if metadata else None
    doi = metadata.get("doi") if metadata else None

    # Ensure empty strings are converted to None
    paper.volume = volume if volume and volume.strip() else None
    paper.issue = issue if issue and issue.strip() else None
    paper.pages = pages if pages and pages.strip() else None
    # Only update DOI if not already set or if new one is provided
    if doi and doi.strip():
      paper.doi = doi.strip()

    await session.commit()
    await session.refresh(paper, ["groups", "tags"])

    # Ensure tags are loaded
    _ = list(paper.tags) if hasattr(paper, "tags") else []

    return PaperSchema.model_validate(paper)

  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Error regenerating metadata: {str(e)}"
    ) from e


@router.post("/papers/{paper_id}/extract-citations")
async def extract_paper_citations(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """Extract and store citations from a paper's PDF file."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.file_path:
    raise HTTPException(status_code=400, detail="Paper has no associated PDF file")

  try:
    # Load PDF file
    from pathlib import Path

    file_path = Path(cast(str, paper.file_path))
    if not file_path.exists():
      raise HTTPException(
        status_code=404, detail=f"PDF file not found at {paper.file_path}"
      )

    with open(file_path, "rb") as f:
      pdf_content = f.read()

    # Extract and store citations
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


class BulkRegenerateRequest(BaseModel):
  paper_ids: list[int]


class BulkRegenerateResponse(BaseModel):
  successful: list[int]
  failed: list[dict]


@router.post("/papers/regenerate-metadata-bulk", response_model=BulkRegenerateResponse)
async def regenerate_paper_metadata_bulk(
  request: BulkRegenerateRequest, session: AsyncSession = Depends(get_db)
):
  """Regenerate metadata for multiple papers using AI-structured extraction."""
  successful = []
  failed = []

  for paper_id in request.paper_ids:
    try:
      query = select(Paper).where(Paper.id == paper_id)
      result = await session.execute(query)
      paper = result.scalar_one_or_none()

      if not paper:
        failed.append({"paper_id": paper_id, "error": "Paper not found"})
        continue

      if not paper.file_path:
        failed.append(
          {"paper_id": paper_id, "error": "Paper has no associated PDF file"}
        )
        continue

      # Load PDF file
      from pathlib import Path

      file_path = Path(cast(str, paper.file_path))
      if not file_path.exists():
        failed.append(
          {"paper_id": paper_id, "error": f"PDF file not found at {paper.file_path}"}
        )
        continue

      with open(file_path, "rb") as f:
        pdf_content = f.read()

      # Regenerate metadata using AI extraction
      metadata = await pdf_parser.extract_metadata(pdf_content)

      if metadata:
        sanitized_metadata = {}
        for key, value in metadata.items():
          if isinstance(value, str):
            sanitized_metadata[key] = sanitize_text(value)
          elif isinstance(value, list):
            sanitized_metadata[key] = [
              sanitize_text(item) if isinstance(item, str) else item
              for item in value
            ]
          else:
            sanitized_metadata[key] = value
        metadata = sanitized_metadata

      # Update paper with new metadata (replace all)
      if (
        metadata
        and metadata.get("title")
        and len(metadata.get("title", "").strip()) > 0
      ):
        t = metadata.get("title")
        paper.title = sanitize_text(t.strip() if t else "")

      paper.metadata_json = metadata or {}

      # Update direct columns from metadata
      volume = metadata.get("volume") if metadata else None
      issue = metadata.get("issue") if metadata else None
      pages = metadata.get("pages") if metadata else None
      doi = metadata.get("doi") if metadata else None

      paper.volume = volume if volume and volume.strip() else None
      paper.issue = issue if issue and issue.strip() else None
      paper.pages = pages if pages and pages.strip() else None
      if doi and doi.strip():
        paper.doi = doi.strip()

      await session.commit()
      successful.append(paper_id)

    except Exception as e:
      failed.append({"paper_id": paper_id, "error": str(e)})
      # Continue with next paper even if one fails

  return BulkRegenerateResponse(successful=successful, failed=failed)


@router.patch("/papers/{paper_id}/reading-status", response_model=PaperSchema)
async def update_reading_status(
  paper_id: int,
  status_update: ReadingStatusUpdate,
  session: AsyncSession = Depends(get_db),
):
  """Update reading status for a paper."""
  query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == paper_id)
  )
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  valid_statuses = ["not_started", "in_progress", "read", "archived"]
  if status_update.reading_status not in valid_statuses:
    raise HTTPException(
      status_code=400,
      detail=f"Invalid reading status. Must be one of: {', '.join(valid_statuses)}",
    )

  paper.reading_status = status_update.reading_status
  paper.status_updated_at = datetime.now(timezone.utc)
  await session.commit()
  await session.refresh(paper, ["groups", "tags"])

  _ = list(paper.tags) if hasattr(paper, "tags") else []

  return PaperSchema.model_validate(paper)


@router.patch("/papers/{paper_id}/priority", response_model=PaperSchema)
async def update_priority(
  paper_id: int,
  priority_update: PriorityUpdate,
  session: AsyncSession = Depends(get_db),
):
  """Update priority for a paper."""
  query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == paper_id)
  )
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  valid_priorities = ["low", "medium", "high", "critical"]
  if priority_update.priority not in valid_priorities:
    raise HTTPException(
      status_code=400,
      detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}",
    )

  paper.priority = priority_update.priority
  await session.commit()
  await session.refresh(paper, ["groups", "tags"])

  _ = list(paper.tags) if hasattr(paper, "tags") else []

  return PaperSchema.model_validate(paper)


@router.get("/papers/{paper_id}/reading-progress", response_model=PaperReadingProgress)
async def get_reading_progress(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get reading progress for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

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
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  # Update paper status to in_progress if not already
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
  # Find the most recent active session for this paper
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

  # Calculate duration if not provided
  if session_update.duration_minutes is None:
    duration = (
      reading_session.end_time - reading_session.start_time
    ).total_seconds() / 60
    reading_session.duration_minutes = int(duration)
  else:
    reading_session.duration_minutes = session_update.duration_minutes

  if session_update.pages_viewed is not None:
    reading_session.pages_viewed = session_update.pages_viewed

  # Update paper reading time
  query_paper = select(Paper).where(Paper.id == paper_id)
  result_paper = await session.execute(query_paper)
  paper = result_paper.scalar_one_or_none()

  if paper:
    total_minutes = await reading_tracker_service.aggregate_reading_time(
      session, paper_id
    )
    paper.reading_time_minutes = total_minutes
    paper.last_read_at = now
    # Update last_read_page if provided (use actual page number, not count)
    if session_update.last_read_page is not None:
      paper.last_read_page = session_update.last_read_page

  await session.commit()
  await session.refresh(reading_session)

  return ReadingSessionResponse.model_validate(reading_session)


@router.get("/papers/{paper_id}/bookmarks", response_model=list[BookmarkResponse])
async def list_bookmarks(paper_id: int, session: AsyncSession = Depends(get_db)):
  """List all bookmarks for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  bookmarks_query = (
    select(Bookmark)
    .where(Bookmark.paper_id == paper_id)
    .order_by(Bookmark.page_number, Bookmark.created_at)
  )
  bookmarks_result = await session.execute(bookmarks_query)
  bookmarks = bookmarks_result.scalars().all()

  return [BookmarkResponse.model_validate(bookmark) for bookmark in bookmarks]


@router.post(
  "/papers/{paper_id}/bookmarks", response_model=BookmarkResponse, status_code=201
)
async def create_bookmark(
  paper_id: int,
  bookmark_create: BookmarkCreate,
  session: AsyncSession = Depends(get_db),
):
  """Create a bookmark for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  bookmark = Bookmark(
    paper_id=paper_id,
    page_number=bookmark_create.page_number,
    note=bookmark_create.note,
  )
  session.add(bookmark)
  await session.commit()
  await session.refresh(bookmark)

  return BookmarkResponse.model_validate(bookmark)


@router.delete("/papers/{paper_id}/bookmarks/{bookmark_id}", status_code=204)
async def delete_bookmark(
  paper_id: int, bookmark_id: int, session: AsyncSession = Depends(get_db)
):
  """Delete a bookmark."""
  query = (
    select(Bookmark)
    .where(Bookmark.id == bookmark_id)
    .where(Bookmark.paper_id == paper_id)
  )
  result = await session.execute(query)
  bookmark = result.scalar_one_or_none()

  if not bookmark:
    raise HTTPException(status_code=404, detail="Bookmark not found")

  await session.delete(bookmark)
  await session.commit()

  return None
