"""SavedSearch CRUD functions."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_search import SavedSearch


async def get_saved_search_or_404(session: AsyncSession, search_id: int) -> SavedSearch:
  """Fetch a saved search by ID or raise 404."""
  query = select(SavedSearch).where(SavedSearch.id == search_id)
  result = await session.execute(query)
  saved_search = result.scalar_one_or_none()

  if not saved_search:
    raise HTTPException(status_code=404, detail="Saved search not found")

  return saved_search


async def list_saved_searches(session: AsyncSession) -> list[SavedSearch]:
  """List all saved searches."""
  query = select(SavedSearch).order_by(SavedSearch.created_at.desc())
  result = await session.execute(query)
  return list(result.scalars().all())


async def create_saved_search(
  session: AsyncSession,
  name: str,
  *,
  description: str | None = None,
  query_params: dict | None = None,
) -> SavedSearch:
  """Create a new saved search."""
  saved_search = SavedSearch(
    name=name,
    description=description,
    query_params=query_params,
  )
  session.add(saved_search)
  await session.commit()
  await session.refresh(saved_search)

  return saved_search


async def delete_saved_search(session: AsyncSession, search_id: int) -> None:
  """Delete a saved search."""
  saved_search = await get_saved_search_or_404(session, search_id)
  await session.delete(saved_search)
  await session.commit()
