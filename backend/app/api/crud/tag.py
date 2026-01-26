"""Tag CRUD functions."""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tag import Tag


async def get_tag_or_404(session: AsyncSession, tag_id: int) -> Tag:
  """Fetch a tag by ID or raise 404."""
  query = select(Tag).where(Tag.id == tag_id)
  result = await session.execute(query)
  tag = result.scalar_one_or_none()

  if not tag:
    raise HTTPException(status_code=404, detail="Tag not found")

  return tag


async def list_tags(
  session: AsyncSession,
  *,
  page: int = 1,
  page_size: int = 100,
  search: str | None = None,
) -> tuple[list[Tag], int]:
  """List tags with pagination."""
  query = select(Tag)

  if search:
    query = query.where(Tag.name.ilike(f"%{search}%"))

  # Count
  count_query = select(func.count()).select_from(Tag)
  if search:
    count_query = count_query.where(Tag.name.ilike(f"%{search}%"))

  total_result = await session.execute(count_query)
  total = total_result.scalar() or 0

  # Paginate
  offset = (page - 1) * page_size
  query = query.order_by(Tag.name.asc()).offset(offset).limit(page_size)

  result = await session.execute(query)
  tags = list(result.scalars().all())

  return tags, total


async def create_tag(session: AsyncSession, name: str) -> Tag:
  """Create a new tag or raise 400 if name exists."""
  # Check uniqueness
  existing = await session.execute(select(Tag).where(Tag.name == name))
  if existing.scalar_one_or_none():
    raise HTTPException(status_code=400, detail="Tag with this name already exists")

  tag = Tag(name=name)
  session.add(tag)
  await session.commit()
  await session.refresh(tag)

  return tag


async def update_tag(session: AsyncSession, tag_id: int, name: str) -> Tag:
  """Update a tag name."""
  tag = await get_tag_or_404(session, tag_id)

  # Check uniqueness
  existing = await session.execute(
    select(Tag).where(Tag.name == name, Tag.id != tag_id)
  )
  if existing.scalar_one_or_none():
    raise HTTPException(status_code=400, detail="Tag with this name already exists")

  tag.name = name
  await session.commit()
  await session.refresh(tag)

  return tag


async def delete_tag(session: AsyncSession, tag_id: int) -> None:
  """Delete a tag."""
  tag = await get_tag_or_404(session, tag_id)
  await session.delete(tag)
  await session.commit()
