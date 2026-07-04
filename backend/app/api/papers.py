"""Papers API endpoints."""

import asyncio
from datetime import datetime, timezone
from typing import Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud import (
  create_bookmark,
  delete_bookmark,
  delete_paper,
  delete_papers_bulk,
  get_or_create_state,
  get_paper_or_404,
  get_visible_paper_or_404,
  increment_view_count,
  list_bookmarks_for_paper,
  update_paper,
  update_priority,
  update_reading_status,
)
from app.api.crud.utils import ensure_loaded, sanitize_metadata
from app.core.logger import get_logger
from app.dependencies import AdminUser, CurrentUser, get_db, scoped_user_id
from app.models.paper import Paper
from app.models.reading_session import ReadingSession
from app.models.sharing import GroupShare, PaperShare, UserPaperState
from app.models.user import User
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
from app.schemas.sharing import (
  ShareListResponse,
  ShareRecipient,
  ShareRequest,
  ShareUpdate,
)
from app.services.access import apply_visible_papers_filter
from app.services.citation_extractor import citation_extractor
from app.services.content_provider import content_provider
from app.services.ingestion import sanitize_text
from app.services.pdf_parser import pdf_parser
from app.services.reading_tracker import reading_tracker_service
from app.services.references import reference_formatter
from app.services.semantic_scholar import semantic_scholar_service

logger = get_logger(__name__)

router = APIRouter()


def _normalize_emails(emails: list[str]) -> list[str]:
  normalized: list[str] = []
  seen: set[str] = set()
  for email in emails:
    cleaned = email.strip().lower()
    if not cleaned or cleaned in seen:
      continue
    seen.add(cleaned)
    normalized.append(cleaned)
  return normalized


def _serialize_share(share: PaperShare) -> ShareRecipient:
  recipient = cast(User, share.recipient)
  return ShareRecipient(
    user_id=cast(int, recipient.id),
    email=cast(str, recipient.email),
    display_name=cast(str, recipient.display_name),
    permission=cast(str, share.permission),
    shared_by_id=cast(int | None, share.shared_by_id),
    created_at=cast(datetime, share.created_at),
  )


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
  """Fetch direct PaperShare rows for the current user (recipient side)."""
  if user_id is None or not paper_ids:
    return {}
  result = await session.execute(
    select(PaperShare)
    .where(PaperShare.recipient_id == user_id, PaperShare.paper_id.in_(paper_ids))
    .options(selectinload(PaperShare.shared_by))
  )
  return {cast(int, s.paper_id): s for s in result.scalars().all()}


def _paper_to_schema(
  paper: Paper,
  state: UserPaperState | None = None,
  *,
  user_id: int | None = None,
  share: PaperShare | None = None,
) -> PaperSchema:
  data = PaperSchema.model_validate(paper).model_dump()
  if state:
    data["reading_status"] = state.reading_status or "not_started"
    data["priority"] = state.priority or "low"
    data["reading_time_minutes"] = state.reading_time_minutes or 0
    data["last_read_page"] = state.last_read_page
    data["last_read_at"] = state.last_read_at
    data["status_updated_at"] = state.status_updated_at

  # Permission / sharing info
  if user_id is None:
    # Admin — treat as owner
    data["my_permission"] = "owner"
    data["is_shared"] = False
  elif paper.uploaded_by_id == user_id:
    data["my_permission"] = "owner"
    data["is_shared"] = False
  elif share is not None:
    data["my_permission"] = str(share.permission)
    data["is_shared"] = True
    if share.shared_by:
      data["shared_by"] = {
        "id": share.shared_by.id,
        "display_name": share.shared_by.display_name,
        "email": share.shared_by.email,
      }
  else:
    # Visible via group share — default to viewer
    data["my_permission"] = "viewer"
    data["is_shared"] = True

  return PaperSchema(**data)


async def _get_owned_paper_or_403(
  session: AsyncSession, paper_id: int, user: CurrentUser
) -> Paper:
  paper = await get_paper_or_404(session, paper_id)
  if paper.uploaded_by_id != user.id:
    raise HTTPException(
      status_code=403, detail="Only the paper owner can manage shares"
    )
  return paper


@router.get("/papers", response_model=PaperListResponse)
async def list_papers_endpoint(
  user: CurrentUser,
  page: int = Query(1, ge=1),
  page_size: int = Query(20, ge=1, le=100),
  search: Optional[str] = None,
  sort_by: Optional[str] = Query(
    "date_added", pattern="^(date_added|viewed|title|authors|last_read_at)$"
  ),
  sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
  group_id: Optional[int] = None,
  ungrouped: Optional[bool] = None,
  tag_id: Optional[int] = None,
  has_file: Optional[bool] = None,
  date_from: Optional[str] = None,
  date_to: Optional[str] = None,
  ownership: Optional[str] = Query(None, pattern="^(mine|shared|all)$"),
  session: AsyncSession = Depends(get_db),
):
  """List papers with filtering and pagination."""
  # Build base query with eager loading
  from sqlalchemy import exists, func, or_

  from app.models.paper import paper_group_association
  from app.models.tag import paper_tag_association

  query = select(Paper).options(
    selectinload(Paper.annotations),
    selectinload(Paper.groups),
    selectinload(Paper.tags),
  )

  # Scope to current user (admin sees all)
  uid = scoped_user_id(user)
  query = apply_visible_papers_filter(query, uid)

  if ownership == "mine" and uid is not None:
    query = query.where(Paper.uploaded_by_id == uid)
  elif ownership == "shared" and uid is not None:
    query = query.where(Paper.uploaded_by_id != uid)

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

  # Papers belonging to no group at all (the Finder shows these at its root).
  if ungrouped:
    query = query.where(~exists().where(paper_group_association.c.paper_id == Paper.id))

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
  if sort_by == "last_read_at" and uid is not None:
    query = query.outerjoin(
      UserPaperState,
      (UserPaperState.paper_id == Paper.id) & (UserPaperState.user_id == uid),
    )
    sort_col = UserPaperState.last_read_at
    if sort_order == "asc":
      query = query.order_by(sort_col.asc().nulls_first(), Paper.id.desc())
    else:
      query = query.order_by(sort_col.desc().nulls_last(), Paper.id.desc())
  else:
    sort_column = {
      "date_added": Paper.created_at,
      "viewed": Paper.viewed_count,
      "title": Paper.title,
      "authors": Paper.title,  # Fallback for metadata-based sort
    }.get(sort_by, Paper.created_at)

    if sort_order == "asc":
      query = query.order_by(sort_column.asc(), Paper.id.desc())
    else:
      query = query.order_by(sort_column.desc().nulls_last(), Paper.id.desc())

  # Paginate
  offset = (page - 1) * page_size
  query = query.offset(offset).limit(page_size)

  result = await session.execute(query)
  papers = list(result.scalars().all())

  for paper in papers:
    ensure_loaded(paper, "tags", "groups")

  # Fetch per-user reading state and share info
  paper_ids = [cast(int, p.id) for p in papers]
  states = await _fetch_user_states(session, uid, paper_ids)
  shares = await _fetch_share_info(session, uid, paper_ids)

  def _enrich(p: Paper) -> PaperSchema:
    pid = cast(int, p.id)
    return _paper_to_schema(p, states.get(pid), user_id=uid, share=shares.get(pid))

  # Python-side sort for authors since it's in metadata_json
  if sort_by == "authors":
    papers_list = [_enrich(p) for p in papers]
    papers_list.sort(
      key=lambda p: (p.metadata_json or {}).get("authors", "") or "",
      reverse=(sort_order == "desc"),
    )
    return PaperListResponse(
      papers=papers_list, total=total, page=page, page_size=page_size
    )

  return PaperListResponse(
    papers=[_enrich(p) for p in papers],
    total=total,
    page=page,
    page_size=page_size,
  )


async def _single_paper_schema(
  session: AsyncSession, paper: Paper, uid: int | None
) -> PaperSchema:
  pid = cast(int, paper.id)
  states = await _fetch_user_states(session, uid, [pid])
  shares = await _fetch_share_info(session, uid, [pid])
  return _paper_to_schema(paper, states.get(pid), user_id=uid, share=shares.get(pid))


# NOTE: must be registered before /papers/{paper_id} so "recent" isn't
# swallowed by the int path parameter.
@router.get("/papers/recent", response_model=PaperListResponse)
async def recent_papers_endpoint(
  user: CurrentUser,
  limit: int = Query(10, ge=1, le=50),
  session: AsyncSession = Depends(get_db),
):
  """Papers the user opened most recently (server-side recents)."""
  uid = scoped_user_id(user)
  if uid is None:
    return PaperListResponse(papers=[], total=0, page=1, page_size=limit)

  result = await session.execute(
    select(Paper)
    .join(
      UserPaperState,
      (UserPaperState.paper_id == Paper.id) & (UserPaperState.user_id == uid),
    )
    .options(
      selectinload(Paper.tags),
      selectinload(Paper.groups),
    )
    .where(UserPaperState.last_opened_at.isnot(None))
    .order_by(UserPaperState.last_opened_at.desc())
    .limit(limit)
  )
  papers = list(result.scalars().all())

  paper_ids = [cast(int, p.id) for p in papers]
  states = await _fetch_user_states(session, uid, paper_ids)
  shares = await _fetch_share_info(session, uid, paper_ids)

  return PaperListResponse(
    papers=[
      _paper_to_schema(
        p, states.get(cast(int, p.id)), user_id=uid, share=shares.get(cast(int, p.id))
      )
      for p in papers
    ],
    total=len(papers),
    page=1,
    page_size=limit,
  )


@router.get("/papers/{paper_id}", response_model=PaperSchema)
async def get_paper_endpoint(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get a single paper by ID."""
  uid = scoped_user_id(user)
  paper = await increment_view_count(session, paper_id, user_id=uid)
  return await _single_paper_schema(session, paper, uid)


@router.get("/papers/{paper_id}/progress")
async def get_paper_processing_progress(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Per-step processing progress, read from the Redis marker list."""
  import json

  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  def _read_markers() -> list[str]:
    from app.tasks.base import get_redis

    return cast(
      "list[str]", get_redis().lrange(f"paper:{paper_id}:progress", 0, -1)
    )

  events = []
  for raw in await asyncio.to_thread(_read_markers):
    try:
      events.append(json.loads(raw))
    except (ValueError, TypeError):
      continue

  return {
    "paper_id": paper_id,
    "processing_status": paper.processing_status,
    "events": events,
    "done": paper.processing_status in ("completed", "failed"),
  }


@router.get("/papers/{paper_id}/file")
async def get_paper_file(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Stream an accessible paper PDF through an authenticated route."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )
  file_path = content_provider.get_local_file_path(paper)
  if not file_path:
    raise HTTPException(status_code=404, detail="PDF file not found")

  return FileResponse(
    path=file_path,
    media_type="application/pdf",
    filename=file_path.name,
  )


@router.get("/papers/{paper_id}/layout")
async def get_paper_layout(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """PDF layout blocks (ParsedOcrOutput envelope), extracted on demand.

  On-demand extraction doubles as the backfill path for papers ingested
  before layout extraction joined the processing chain.
  """
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  if paper.layout_blocks is None:
    file_path = content_provider.get_local_file_path(paper)
    if not file_path:
      raise HTTPException(status_code=404, detail="PDF file not found")

    from app.services.layout_extractor import extract_layout

    blocks = await asyncio.to_thread(extract_layout, file_path.read_bytes())
    paper.layout_blocks = blocks
    paper.layout_extracted_at = datetime.now(timezone.utc)
    await session.commit()

  return {"chunks": [{"blocks": paper.layout_blocks}]}


@router.get("/papers/{paper_id}/figures/{index}/thumbnail")
async def get_paper_figure_thumbnail(
  paper_id: int,
  index: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Render a single figure (1-based ``index``) to a PNG data URL on demand.

  Kept out of the reference manifest so base64 image data never lands in the
  DB — chat reference chips fetch figure thumbnails through this route lazily.
  """
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  from app.services.figure_service import list_figures, render_figure_data_url

  figures = list_figures(paper.layout_blocks)
  if index < 1 or index > len(figures):
    raise HTTPException(status_code=404, detail="Figure not found")

  fig = figures[index - 1]
  data_url = fig.get("image")
  if not data_url:
    file_path = content_provider.get_local_file_path(paper)
    page = fig.get("page")
    bbox = fig.get("bbox")
    if file_path and page and bbox:
      data_url = await asyncio.to_thread(render_figure_data_url, file_path, page, bbox)
  if not data_url:
    raise HTTPException(status_code=404, detail="Figure image unavailable")

  return {"thumbnail_url": data_url}


@router.patch("/papers/{paper_id}", response_model=PaperSchema)
async def update_paper_endpoint(
  paper_id: int,
  paper_update: PaperUpdate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Update a paper."""
  uid = scoped_user_id(user)
  paper = await update_paper(
    session,
    paper_id,
    user_id=uid,
    title=paper_update.title,
    doi=paper_update.doi,
    metadata_json=paper_update.metadata_json,
    group_ids=paper_update.group_ids,
    tag_ids=paper_update.tag_ids,
  )
  return await _single_paper_schema(session, paper, uid)


@router.delete("/papers/{paper_id}", status_code=204)
async def delete_paper_endpoint(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Delete a paper."""
  await delete_paper(session, paper_id, user_id=scoped_user_id(user))
  return None


@router.delete("/papers", status_code=204)
async def delete_papers_bulk_endpoint(
  user: CurrentUser,
  paper_ids: list[int] = Query(..., description="List of paper IDs to delete"),
  session: AsyncSession = Depends(get_db),
):
  """Delete multiple papers by ID."""
  await delete_papers_bulk(session, paper_ids, user_id=scoped_user_id(user))
  return None


@router.get("/papers/{paper_id}/reference")
async def get_paper_reference(
  paper_id: int,
  user: CurrentUser,
  format: str = Query("apa", pattern="^(apa|mla|bibtex)$"),
  session: AsyncSession = Depends(get_db),
):
  """Get formatted reference for a paper."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  formatter = {
    "apa": reference_formatter.format_apa,
    "mla": reference_formatter.format_mla,
    "bibtex": reference_formatter.format_bibtex,
  }.get(format)

  if not formatter:
    raise HTTPException(status_code=400, detail="Invalid format")

  return {"format": format, "reference": formatter(paper)}


@router.get("/papers/{paper_id}/related", response_model=RelatedPapersResponse)
async def get_related_papers(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get related papers from library and external sources."""
  paper = await get_visible_paper_or_404(
    session, paper_id, with_relations=True, user_id=scoped_user_id(user)
  )

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

        lib_states = await _fetch_user_states(session, scoped_user_id(user), lib_ids)
        lib_shares = await _fetch_share_info(session, scoped_user_id(user), lib_ids)
        related_library = [
          _paper_to_schema(
            lib_papers[pid],
            lib_states.get(pid),
            user_id=scoped_user_id(user),
            share=lib_shares.get(pid),
          )
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
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Regenerate metadata for a paper using AI extraction."""
  paper = await get_visible_paper_or_404(
    session, paper_id, with_relations=True, user_id=scoped_user_id(user)
  )

  if not paper.file_path:
    raise HTTPException(status_code=400, detail="Paper has no associated PDF file")

  file_path = content_provider.get_local_file_path(paper)
  if not file_path:
    raise HTTPException(
      status_code=404, detail=f"PDF file not found at {paper.file_path}"
    )

  try:
    with open(file_path, "rb") as f:
      pdf_content = f.read()

    metadata = await pdf_parser.extract_metadata(pdf_content, user.id)
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

    uid = scoped_user_id(user)
    return await _single_paper_schema(session, paper, uid)

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Error regenerating metadata: {str(e)}"
    ) from e


@router.post("/papers/regenerate-metadata-bulk", response_model=BulkRegenerateResponse)
async def regenerate_paper_metadata_bulk(
  request: BulkRegenerateRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Regenerate metadata for multiple papers."""
  successful = []
  failed = []

  for paper_id in request.paper_ids:
    try:
      query = (
        select(Paper).where(Paper.id == paper_id).options(selectinload(Paper.tags))
      )
      query = apply_visible_papers_filter(query, scoped_user_id(user))
      result = await session.execute(query)
      paper = result.scalar_one_or_none()

      if not paper:
        failed.append({"paper_id": paper_id, "error": "Paper not found"})
        continue

      if not paper.file_path:
        failed.append({"paper_id": paper_id, "error": "No PDF file"})
        continue

      file_path = content_provider.get_local_file_path(paper)
      if not file_path:
        failed.append({"paper_id": paper_id, "error": "PDF file not found"})
        continue

      with open(file_path, "rb") as f:
        pdf_content = f.read()

      metadata = await pdf_parser.extract_metadata(pdf_content, user.id)
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
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Extract and store citations from a paper's layout blocks (or PDF fallback)."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  if not paper.layout_blocks and not paper.file_path:
    raise HTTPException(
      status_code=400,
      detail="Paper has no layout blocks or file — cannot extract citations",
    )

  pdf_content: bytes | None = None
  if not paper.layout_blocks and paper.file_path:
    file_path = content_provider.get_local_file_path(paper)
    if not file_path:
      raise HTTPException(
        status_code=404, detail=f"PDF file not found at {paper.file_path}"
      )
    with open(file_path, "rb") as f:
      pdf_content = f.read()

  try:
    citation_count = await citation_extractor.extract_and_store_citations(
      session,
      paper_id,
      layout_blocks=cast("list[dict[str, Any]] | None", paper.layout_blocks),
      pdf_content=pdf_content,
      user_id=user.id,
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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Update reading status for a paper."""
  uid = scoped_user_id(user)
  paper = await update_reading_status(
    session, paper_id, status_update.reading_status, user_id=uid
  )
  return await _single_paper_schema(session, paper, uid)


@router.patch("/papers/{paper_id}/priority", response_model=PaperSchema)
async def update_priority_endpoint(
  paper_id: int,
  priority_update: PriorityUpdate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Update priority for a paper."""
  uid = scoped_user_id(user)
  paper = await update_priority(
    session, paper_id, priority_update.priority, user_id=uid
  )
  return await _single_paper_schema(session, paper, uid)


@router.get("/papers/{paper_id}/reading-progress", response_model=PaperReadingProgress)
async def get_reading_progress(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get reading progress for a paper."""
  uid = scoped_user_id(user)
  await get_visible_paper_or_404(session, paper_id, user_id=uid)
  states = await _fetch_user_states(session, uid, [paper_id])
  state = states.get(paper_id)

  return PaperReadingProgress(
    paper_id=paper_id,
    reading_status=state.reading_status if state else "not_started",
    reading_time_minutes=state.reading_time_minutes if state else 0,
    last_read_page=state.last_read_page if state else None,
    priority=state.priority if state else "low",
    status_updated_at=state.status_updated_at if state else None,
    last_read_at=state.last_read_at if state else None,
  )


@router.post(
  "/papers/{paper_id}/reading-session/start", response_model=ReadingSessionResponse
)
async def start_reading_session(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Start a reading session for a paper."""
  uid = scoped_user_id(user)
  await get_visible_paper_or_404(session, paper_id, user_id=uid)

  if uid is not None:
    state = await get_or_create_state(session, uid, paper_id)
    if state.reading_status == "not_started":
      state.reading_status = "in_progress"
      state.status_updated_at = datetime.now(timezone.utc)

  reading_session = ReadingSession(
    paper_id=paper_id,
    user_id=user.id if user.role != "admin" else None,
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
  user: CurrentUser,
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
  uid = scoped_user_id(user)
  if uid is not None:
    query = query.where(ReadingSession.user_id == uid)
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

  await get_visible_paper_or_404(session, paper_id, user_id=uid)
  total_minutes = await reading_tracker_service.aggregate_reading_time(
    session, paper_id
  )

  if uid is not None:
    state = await get_or_create_state(session, uid, paper_id)
    state.reading_time_minutes = total_minutes
    state.last_read_at = now
    if session_update.last_read_page is not None:
      state.last_read_page = session_update.last_read_page

  await session.commit()
  await session.refresh(reading_session)

  return ReadingSessionResponse.model_validate(reading_session)


@router.get("/papers/{paper_id}/bookmarks", response_model=list[BookmarkResponse])
async def list_bookmarks_endpoint(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """List all bookmarks for a paper."""
  bookmarks = await list_bookmarks_for_paper(
    session, paper_id, user_id=scoped_user_id(user)
  )
  return [BookmarkResponse.model_validate(b) for b in bookmarks]


@router.post(
  "/papers/{paper_id}/bookmarks", response_model=BookmarkResponse, status_code=201
)
async def create_bookmark_endpoint(
  paper_id: int,
  bookmark_create: BookmarkCreate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Create a bookmark for a paper."""
  bookmark = await create_bookmark(
    session,
    paper_id,
    bookmark_create.page_number,
    bookmark_create.note,
    user_id=scoped_user_id(user),
  )
  return BookmarkResponse.model_validate(bookmark)


@router.delete("/papers/{paper_id}/bookmarks/{bookmark_id}", status_code=204)
async def delete_bookmark_endpoint(
  paper_id: int,
  bookmark_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Delete a bookmark."""
  await delete_bookmark(session, bookmark_id, paper_id, user_id=scoped_user_id(user))
  return None


@router.get("/shared-with-me")
async def shared_with_me(user: CurrentUser, session: AsyncSession = Depends(get_db)):
  """Get all papers and groups shared with the current user."""
  uid = scoped_user_id(user)
  if uid is None:
    return {"papers": [], "groups": []}

  paper_result = await session.execute(
    select(PaperShare)
    .where(PaperShare.recipient_id == uid)
    .options(selectinload(PaperShare.paper), selectinload(PaperShare.shared_by))
  )
  paper_shares = paper_result.scalars().all()

  group_result = await session.execute(
    select(GroupShare)
    .where(GroupShare.recipient_id == uid)
    .options(selectinload(GroupShare.group), selectinload(GroupShare.shared_by))
  )
  group_shares = group_result.scalars().all()

  return {
    "papers": [
      {
        "paper_id": s.paper_id,
        "title": s.paper.title if s.paper else None,
        "permission": s.permission,
        "shared_by": s.shared_by.display_name if s.shared_by else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
      }
      for s in paper_shares
    ],
    "groups": [
      {
        "group_id": s.group_id,
        "name": s.group.name if s.group else None,
        "permission": s.permission,
        "shared_by": s.shared_by.display_name if s.shared_by else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
      }
      for s in group_shares
    ],
  }


@router.post("/papers/{paper_id}/share", response_model=ShareListResponse)
async def share_paper(
  paper_id: int,
  payload: ShareRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Share a paper directly with one or more existing users."""
  paper = await _get_owned_paper_or_403(session, paper_id, user)
  paper_title = str(paper.title)

  emails = _normalize_emails(payload.emails)
  if not emails:
    raise HTTPException(
      status_code=400, detail="At least one recipient email is required"
    )

  users_result = await session.execute(select(User).where(User.email.in_(emails)))
  recipients = list(users_result.scalars().all())
  recipients_by_email = {
    cast(str, recipient.email).lower(): recipient for recipient in recipients
  }

  missing_emails = [email for email in emails if email not in recipients_by_email]
  skipped_emails: list[str] = []
  shares: list[PaperShare] = []

  recipient_ids = [
    cast(int, recipient.id)
    for recipient in recipients
    if cast(int, recipient.id) != user.id
  ]
  for recipient in recipients:
    if recipient.id == user.id:
      skipped_emails.append(cast(str, recipient.email))

  existing_by_recipient_id: dict[int, PaperShare] = {}
  if recipient_ids:
    existing_result = await session.execute(
      select(PaperShare)
      .where(PaperShare.paper_id == paper_id)
      .where(PaperShare.recipient_id.in_(recipient_ids))
      .options(selectinload(PaperShare.recipient))
    )
    existing_by_recipient_id = {
      cast(int, share.recipient_id): share for share in existing_result.scalars().all()
    }

  for recipient in recipients:
    recipient_id = cast(int, recipient.id)
    if recipient_id == user.id:
      continue

    share = existing_by_recipient_id.get(recipient_id)
    if share is None:
      share = PaperShare(
        paper_id=paper_id,
        recipient_id=recipient_id,
        shared_by_id=user.id,
        permission=payload.permission,
      )
      share.recipient = recipient
      session.add(share)
    else:
      share.permission = payload.permission
      share.shared_by_id = user.id
    shares.append(share)

  await session.commit()

  if shares:
    share_ids = [cast(int, share.id) for share in shares if share.id is not None]
    refreshed_result = await session.execute(
      select(PaperShare)
      .where(PaperShare.id.in_(share_ids))
      .options(selectinload(PaperShare.recipient))
      .order_by(PaperShare.created_at.asc(), PaperShare.id.asc())
    )
    shares = list(refreshed_result.scalars().all())

  from app.tasks.email_tasks import send_share_email

  for share in shares:
    if share.recipient and getattr(share.recipient, "email", None):
      send_share_email.delay(
        str(share.recipient.email),
        str(user.display_name),
        "paper",
        paper_title,
        payload.permission,
      )

  return ShareListResponse(
    shares=[_serialize_share(share) for share in shares],
    missing_emails=missing_emails,
    skipped_emails=skipped_emails,
  )


@router.get("/papers/{paper_id}/shares", response_model=ShareListResponse)
async def list_paper_shares(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """List direct shares for a paper."""
  await _get_owned_paper_or_403(session, paper_id, user)

  result = await session.execute(
    select(PaperShare)
    .where(PaperShare.paper_id == paper_id)
    .options(selectinload(PaperShare.recipient))
    .order_by(PaperShare.created_at.asc(), PaperShare.id.asc())
  )
  shares = list(result.scalars().all())
  return ShareListResponse(shares=[_serialize_share(share) for share in shares])


@router.patch(
  "/papers/{paper_id}/share/{target_user_id}", response_model=ShareRecipient
)
async def update_paper_share(
  paper_id: int,
  target_user_id: int,
  payload: ShareUpdate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Update permission for a direct paper share."""
  await _get_owned_paper_or_403(session, paper_id, user)

  result = await session.execute(
    select(PaperShare)
    .where(PaperShare.paper_id == paper_id)
    .where(PaperShare.recipient_id == target_user_id)
    .options(selectinload(PaperShare.recipient))
  )
  share = result.scalar_one_or_none()
  if not share:
    raise HTTPException(status_code=404, detail="Share not found")

  share.permission = payload.permission
  share.shared_by_id = user.id
  await session.commit()
  await session.refresh(share, ["recipient"])
  return _serialize_share(share)


@router.delete("/papers/{paper_id}/share/me", status_code=204)
async def leave_paper_share(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Recipient removes their own direct paper share."""
  result = await session.execute(
    select(PaperShare)
    .where(PaperShare.paper_id == paper_id)
    .where(PaperShare.recipient_id == user.id)
  )
  share = result.scalar_one_or_none()
  if not share:
    raise HTTPException(status_code=404, detail="Direct share not found")

  await session.delete(share)
  await session.commit()
  return None


@router.delete("/papers/{paper_id}/share/{target_user_id}", status_code=204)
async def revoke_paper_share(
  paper_id: int,
  target_user_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Owner revokes a direct paper share."""
  await _get_owned_paper_or_403(session, paper_id, user)

  result = await session.execute(
    select(PaperShare)
    .where(PaperShare.paper_id == paper_id)
    .where(PaperShare.recipient_id == target_user_id)
  )
  share = result.scalar_one_or_none()
  if not share:
    raise HTTPException(status_code=404, detail="Share not found")

  await session.delete(share)
  await session.commit()
  return None


class BackfillLayoutsRequest(BaseModel):
  paper_ids: list[int]


class BackfillLayoutsResponse(BaseModel):
  task_id: str
  message: str


@router.post("/papers/backfill-layouts")
async def backfill_layouts(
  request: BackfillLayoutsRequest,
  admin: AdminUser,
) -> BackfillLayoutsResponse:
  """Admin-only: kick off Celery task to backfill layout blocks for papers."""
  from app.tasks.paper_processing import backfill_layouts_task

  task = backfill_layouts_task.delay(request.paper_ids)
  return BackfillLayoutsResponse(
    task_id=task.id,
    message=f"Backfill task dispatched for {len(request.paper_ids)} paper(s)",
  )
