"""Paper CRUD functions."""

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud.utils import ensure_loaded
from app.models.group import Group
from app.models.paper import Paper, paper_group_association
from app.models.tag import Tag, paper_tag_association


async def get_paper_or_404(
  session: AsyncSession,
  paper_id: int,
  *,
  with_relations: bool = False,
) -> Paper:
  """Fetch a paper by ID or raise 404.

  Args:
      session: Database session
      paper_id: Paper ID
      with_relations: If True, eager load annotations, groups, tags
  """
  query = select(Paper).where(Paper.id == paper_id)

  if with_relations:
    query = query.options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )

  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if with_relations:
    ensure_loaded(paper, "tags", "groups", "annotations")

  return paper


async def list_papers(
  session: AsyncSession,
  *,
  page: int = 1,
  page_size: int = 20,
  search: str | None = None,
  group_id: int | None = None,
  tag_id: int | None = None,
) -> tuple[list[Paper], int]:
  """List papers with pagination and filtering.

  Returns:
      Tuple of (papers list, total count)
  """
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

  # Count
  count_query = select(func.count()).select_from(Paper)
  if search:
    count_query = count_query.where(
      or_(
        Paper.title.ilike(f"%{search}%"),
        Paper.content_text.ilike(f"%{search}%"),
      )
    )

  total_result = await session.execute(count_query)
  total = total_result.scalar() or 0

  # Paginate
  offset = (page - 1) * page_size
  query = query.order_by(Paper.created_at.desc()).offset(offset).limit(page_size)

  result = await session.execute(query)
  papers = list(result.scalars().all())

  for paper in papers:
    ensure_loaded(paper, "tags", "groups")

  return papers, total


async def update_paper(
  session: AsyncSession,
  paper_id: int,
  *,
  title: str | None = None,
  doi: str | None = None,
  metadata_json: dict | None = None,
  group_ids: list[int] | None = None,
  tag_ids: list[int] | None = None,
) -> Paper:
  """Update a paper and return the updated entity."""
  paper = await get_paper_or_404(session, paper_id, with_relations=True)

  if title is not None:
    paper.title = title
  if doi is not None:
    paper.doi = doi
  if metadata_json is not None:
    paper.metadata_json = metadata_json

  if group_ids is not None:
    groups_query = select(Group).where(Group.id.in_(group_ids))
    groups_result = await session.execute(groups_query)
    paper.groups = list(groups_result.scalars().all())

  if tag_ids is not None:
    tags_query = select(Tag).where(Tag.id.in_(tag_ids))
    tags_result = await session.execute(tags_query)
    paper.tags = list(tags_result.scalars().all())

  await session.commit()
  await session.refresh(paper, ["groups", "tags"])

  ensure_loaded(paper, "tags", "groups")
  return paper


async def delete_paper(session: AsyncSession, paper_id: int) -> None:
  """Delete a paper and its associated PDF file."""
  from pathlib import Path

  paper = await get_paper_or_404(session, paper_id)

  # Delete PDF file if exists
  if paper.file_path and isinstance(paper.file_path, str):
    try:
      file_path = Path(paper.file_path)
      if file_path.exists():
        file_path.unlink()
    except Exception:
      pass  # Continue even if file deletion fails

  await session.delete(paper)
  await session.commit()


async def delete_papers_bulk(session: AsyncSession, paper_ids: list[int]) -> None:
  """Delete multiple papers by ID."""
  from pathlib import Path

  if not paper_ids:
    raise HTTPException(status_code=400, detail="No paper IDs provided")

  # Fetch all papers at once
  query = select(Paper).where(Paper.id.in_(paper_ids))
  result = await session.execute(query)
  papers = list(result.scalars().all())

  if len(papers) != len(paper_ids):
    found_ids = {p.id for p in papers}
    missing_ids = set(paper_ids) - found_ids
    raise HTTPException(
      status_code=404, detail=f"Papers not found: {sorted(missing_ids)}"
    )

  # Delete PDF files
  for paper in papers:
    if paper.file_path and isinstance(paper.file_path, str):
      try:
        file_path = Path(paper.file_path)
        if file_path.exists():
          file_path.unlink()
      except Exception:
        pass

  # Delete papers
  for paper in papers:
    await session.delete(paper)

  await session.commit()


async def increment_view_count(session: AsyncSession, paper_id: int) -> Paper:
  """Increment view count and return paper with relations."""
  paper = await get_paper_or_404(session, paper_id, with_relations=True)
  paper.viewed_count = (paper.viewed_count or 0) + 1
  await session.commit()
  return paper


async def update_reading_status(
  session: AsyncSession,
  paper_id: int,
  reading_status: str,
) -> Paper:
  """Update reading status for a paper."""
  from datetime import datetime, timezone

  valid_statuses = ["not_started", "in_progress", "read", "archived"]
  if reading_status not in valid_statuses:
    raise HTTPException(
      status_code=400,
      detail=f"Invalid reading status. Must be one of: {', '.join(valid_statuses)}",
    )

  paper = await get_paper_or_404(session, paper_id, with_relations=True)
  paper.reading_status = reading_status
  paper.status_updated_at = datetime.now(timezone.utc)
  await session.commit()
  await session.refresh(paper, ["groups", "tags"])

  ensure_loaded(paper, "tags", "groups")
  return paper


async def update_priority(
  session: AsyncSession,
  paper_id: int,
  priority: str,
) -> Paper:
  """Update priority for a paper."""
  valid_priorities = ["low", "medium", "high", "critical"]
  if priority not in valid_priorities:
    raise HTTPException(
      status_code=400,
      detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}",
    )

  paper = await get_paper_or_404(session, paper_id, with_relations=True)
  paper.priority = priority
  await session.commit()
  await session.refresh(paper, ["groups", "tags"])

  ensure_loaded(paper, "tags", "groups")
  return paper
