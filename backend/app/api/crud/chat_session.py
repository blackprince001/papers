"""ChatSession CRUD functions."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud.paper import get_paper_or_404
from app.api.crud.utils import ensure_loaded
from app.models.chat import ChatSession


async def get_chat_session_or_404(
  session: AsyncSession,
  session_id: int,
  *,
  with_messages: bool = False,
) -> ChatSession:
  """Fetch a chat session by ID or raise 404."""
  query = select(ChatSession).where(ChatSession.id == session_id)

  if with_messages:
    query = query.options(selectinload(ChatSession.messages))

  result = await session.execute(query)
  chat_session = result.scalar_one_or_none()

  if not chat_session:
    raise HTTPException(status_code=404, detail="Session not found")

  if with_messages:
    ensure_loaded(chat_session, "messages")

  return chat_session


async def list_chat_sessions_for_paper(
  session: AsyncSession, paper_id: int
) -> list[ChatSession]:
  """List all chat sessions for a paper."""
  # Verify paper exists
  await get_paper_or_404(session, paper_id)

  query = (
    select(ChatSession)
    .options(selectinload(ChatSession.messages))
    .where(ChatSession.paper_id == paper_id)
    .order_by(ChatSession.updated_at.desc())
  )
  result = await session.execute(query)
  sessions = list(result.scalars().all())

  for s in sessions:
    ensure_loaded(s, "messages")

  return sessions


async def delete_chat_session(session: AsyncSession, session_id: int) -> None:
  """Delete a chat session."""
  chat_session = await get_chat_session_or_404(session, session_id)
  await session.delete(chat_session)
  await session.commit()
