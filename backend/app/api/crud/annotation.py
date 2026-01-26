"""Annotation CRUD functions."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud.paper import get_paper_or_404
from app.models.annotation import Annotation


async def get_annotation_or_404(
  session: AsyncSession, annotation_id: int
) -> Annotation:
  """Fetch an annotation by ID or raise 404."""
  query = select(Annotation).where(Annotation.id == annotation_id)
  result = await session.execute(query)
  annotation = result.scalar_one_or_none()

  if not annotation:
    raise HTTPException(status_code=404, detail="Annotation not found")

  return annotation


async def list_annotations_for_paper(
  session: AsyncSession, paper_id: int
) -> list[Annotation]:
  """List all annotations for a paper."""
  # Verify paper exists
  await get_paper_or_404(session, paper_id)

  query = (
    select(Annotation)
    .where(Annotation.paper_id == paper_id)
    .order_by(Annotation.created_at.desc())
  )
  result = await session.execute(query)
  return list(result.scalars().all())


async def create_annotation(
  session: AsyncSession,
  paper_id: int,
  *,
  content: str | None = None,
  type: str = "annotation",
  highlighted_text: str | None = None,
  selection_data: dict | None = None,
  note_scope: str | None = None,
  coordinate_data: dict | None = None,
) -> Annotation:
  """Create an annotation for a paper."""
  # Verify paper exists
  await get_paper_or_404(session, paper_id)

  annotation = Annotation(
    paper_id=paper_id,
    content=content,
    type=type,
    highlighted_text=highlighted_text,
    selection_data=selection_data,
    note_scope=note_scope,
    coordinate_data=coordinate_data or {},
  )

  session.add(annotation)
  await session.commit()
  await session.refresh(annotation)

  return annotation


async def update_annotation(
  session: AsyncSession,
  annotation_id: int,
  *,
  content: str | None = None,
  type: str | None = None,
  highlighted_text: str | None = None,
  selection_data: dict | None = None,
  note_scope: str | None = None,
  coordinate_data: dict | None = None,
) -> Annotation:
  """Update an annotation."""
  annotation = await get_annotation_or_404(session, annotation_id)

  if content is not None:
    annotation.content = content
  if type is not None:
    annotation.type = type
  if highlighted_text is not None:
    annotation.highlighted_text = highlighted_text
  if selection_data is not None:
    annotation.selection_data = selection_data
  if note_scope is not None:
    annotation.note_scope = note_scope
  if coordinate_data is not None:
    annotation.coordinate_data = coordinate_data

  await session.commit()
  await session.refresh(annotation)

  return annotation


async def delete_annotation(session: AsyncSession, annotation_id: int) -> None:
  """Delete an annotation."""
  annotation = await get_annotation_or_404(session, annotation_id)
  await session.delete(annotation)
  await session.commit()
