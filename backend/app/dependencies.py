from typing import TYPE_CHECKING, Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session

if TYPE_CHECKING:
  from app.models.paper import Paper


async def get_db() -> AsyncGenerator[AsyncSession, None]:
  async for session in get_session():
    yield session


async def get_paper_or_404(
  paper_id: Annotated[int, Path(description="The paper ID")],
  session: AsyncSession = Depends(get_db),
) -> "Paper":
  """Dependency that fetches a paper by ID or raises 404.

  Usage:
    @router.get("/papers/{paper_id}")
    async def get_paper(paper: Paper = Depends(get_paper_or_404)):
        return paper
  """
  from app.models.paper import Paper

  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  return paper


# Type alias for cleaner dependency injection
PaperDep = Annotated["Paper", Depends(get_paper_or_404)]
