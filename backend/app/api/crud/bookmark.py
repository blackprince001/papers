"""Bookmark CRUD functions."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud.paper import get_paper_or_404
from app.models.bookmark import Bookmark


async def get_bookmark_or_404(
  session: AsyncSession,
  bookmark_id: int,
  paper_id: int | None = None,
) -> Bookmark:
  """Fetch a bookmark by ID or raise 404."""
  query = select(Bookmark).where(Bookmark.id == bookmark_id)
  if paper_id is not None:
    query = query.where(Bookmark.paper_id == paper_id)

  result = await session.execute(query)
  bookmark = result.scalar_one_or_none()

  if not bookmark:
    raise HTTPException(status_code=404, detail="Bookmark not found")

  return bookmark


async def list_bookmarks_for_paper(
  session: AsyncSession, paper_id: int
) -> list[Bookmark]:
  """List all bookmarks for a paper."""
  # Verify paper exists
  await get_paper_or_404(session, paper_id)

  query = (
    select(Bookmark)
    .where(Bookmark.paper_id == paper_id)
    .order_by(Bookmark.page_number, Bookmark.created_at)
  )
  result = await session.execute(query)
  return list(result.scalars().all())


async def create_bookmark(
  session: AsyncSession,
  paper_id: int,
  page_number: int,
  note: str | None = None,
) -> Bookmark:
  """Create a bookmark for a paper."""
  # Verify paper exists
  await get_paper_or_404(session, paper_id)

  bookmark = Bookmark(
    paper_id=paper_id,
    page_number=page_number,
    note=note,
  )
  session.add(bookmark)
  await session.commit()
  await session.refresh(bookmark)

  return bookmark


async def delete_bookmark(
  session: AsyncSession, bookmark_id: int, paper_id: int
) -> None:
  """Delete a bookmark."""
  bookmark = await get_bookmark_or_404(session, bookmark_id, paper_id=paper_id)
  await session.delete(bookmark)
  await session.commit()
