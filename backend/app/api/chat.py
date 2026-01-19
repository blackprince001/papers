import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logger import get_logger
from app.dependencies import get_db
from app.models.chat import ChatMessage, ChatSession
from app.models.paper import Paper
from app.schemas.chat import (
  ChatMessage as ChatMessageSchema,
)
from app.schemas.chat import (
  ChatRequest,
  ChatResponse,
  ChatSessionCreate,
  ChatSessionUpdate,
)
from app.schemas.chat import (
  ChatSession as ChatSessionSchema,
)
from app.services.chat import chat_service

logger = get_logger(__name__)

router = APIRouter()


@router.post("/papers/{paper_id}/chat", response_model=ChatResponse)
async def send_chat_message(
  paper_id: int,
  chat_request: ChatRequest,
  session: AsyncSession = Depends(get_db),
):
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  try:
    assistant_message = await chat_service.send_message(
      db_session=session,
      paper_id=paper_id,
      user_message=chat_request.message,
      references=chat_request.references,
      session_id=chat_request.session_id,
    )

    # Re-fetch session to ensure we have latest state if needed,
    # or just use the one from the proper logic
    session_id = assistant_message.session_id if assistant_message else None
    session_query = (
      select(ChatSession)
      .options(selectinload(ChatSession.messages))
      .where(ChatSession.id == session_id)
    )
    session_result = await session.execute(session_query)
    chat_session = session_result.scalar_one_or_none()

    if not chat_session:
      raise HTTPException(
        status_code=500, detail="Chat session not found after message creation"
      )

    # Ensure messages are loaded by accessing them while session is active
    _ = list(chat_session.messages) if hasattr(chat_session, "messages") else []

    return ChatResponse(
      message=ChatMessageSchema.model_validate(assistant_message),
      session=ChatSessionSchema.model_validate(chat_session),
    )
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e)) from e
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Failed to send message: {str(e)}"
    ) from e


@router.get("/papers/{paper_id}/chat", response_model=Optional[ChatSessionSchema])
async def get_chat_history(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """
  Get the latest chat session for a paper.
  Returns None if no session exists (does not create one).
  """
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  chat_session = await chat_service.get_latest_session(
    db_session=session, paper_id=paper_id
  )

  if not chat_session:
    return None

  session_query = (
    select(ChatSession)
    .options(selectinload(ChatSession.messages))
    .where(ChatSession.id == chat_session.id)
  )
  session_result = await session.execute(session_query)
  chat_session = session_result.scalar_one_or_none()

  if not chat_session:
    return None

  # Ensure messages are loaded by accessing them while session is active
  _ = list(chat_session.messages) if hasattr(chat_session, "messages") else []

  return ChatSessionSchema.model_validate(chat_session)


@router.post("/papers/{paper_id}/chat/stream")
async def stream_chat_message(
  paper_id: int,
  chat_request: ChatRequest,
  session: AsyncSession = Depends(get_db),
):
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  async def generate_stream():
    try:
      async for chunk in chat_service.stream_message(
        db_session=session,
        paper_id=paper_id,
        user_message=chat_request.message,
        references=chat_request.references,
        session_id=chat_request.session_id,
      ):
        data = json.dumps(chunk)
        yield f"data: {data}\n\n"
    except Exception as e:
      error_chunk = {"type": "error", "error": str(e)[:200]}
      yield f"data: {json.dumps(error_chunk)}\n\n"

  return StreamingResponse(
    generate_stream(),
    media_type="text/event-stream",
    headers={
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  )


@router.delete("/papers/{paper_id}/chat", status_code=204)
async def clear_chat_history(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """
  DEPRECATED: Clears ALL chat sessions for a paper.
  Kept for backward compatibility, or should we just clear the *current* latest?
  Let's clear ALL for now to match previous behavior,
  but maybe it should be removed in favor of per-session delete.
  """
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  session_query = select(ChatSession).where(ChatSession.paper_id == paper_id)
  session_result = await session.execute(session_query)
  chat_sessions = session_result.scalars().all()

  for chat_session in chat_sessions:
    await session.delete(chat_session)

  await session.commit()
  return None


# --- Session Management Endpoints ---


@router.post("/papers/{paper_id}/sessions", response_model=ChatSessionSchema)
async def create_new_session(
  paper_id: int,
  session_data: ChatSessionCreate,
  session: AsyncSession = Depends(get_db),
):
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  chat_session = await chat_service.create_session(
    db_session=session, paper_id=paper_id, name=session_data.name
  )

  # Re-fetch with messages loaded
  session_query = (
    select(ChatSession)
    .options(selectinload(ChatSession.messages))
    .where(ChatSession.id == chat_session.id)
  )
  session_result = await session.execute(session_query)
  chat_session = session_result.scalar_one_or_none()

  if not chat_session:
    raise HTTPException(status_code=500, detail="Failed to load chat session")

  # Ensure messages are loaded by accessing them while session is active
  _ = list(chat_session.messages) if hasattr(chat_session, "messages") else []

  return ChatSessionSchema.model_validate(chat_session)


@router.get("/papers/{paper_id}/sessions", response_model=List[ChatSessionSchema])
async def list_sessions(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  query = (
    select(ChatSession)
    .options(selectinload(ChatSession.messages))
    .where(ChatSession.paper_id == paper_id)
    .order_by(ChatSession.updated_at.desc())
  )
  result = await session.execute(query)
  sessions = result.scalars().all()

  # Ensure messages are loaded by accessing them while session is active
  for s in sessions:
    _ = list(s.messages) if hasattr(s, "messages") else []

  return [ChatSessionSchema.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=ChatSessionSchema)
async def get_session(
  session_id: int,
  session: AsyncSession = Depends(get_db),
):
  query = (
    select(ChatSession)
    .options(selectinload(ChatSession.messages))
    .where(ChatSession.id == session_id)
  )
  result = await session.execute(query)
  chat_session = result.scalar_one_or_none()

  if not chat_session:
    raise HTTPException(status_code=404, detail="Session not found")

  # Ensure messages are loaded by accessing them while session is active
  _ = list(chat_session.messages) if hasattr(chat_session, "messages") else []

  return ChatSessionSchema.model_validate(chat_session)


@router.patch("/sessions/{session_id}", response_model=ChatSessionSchema)
async def update_session(
  session_id: int,
  session_update: ChatSessionUpdate,
  session: AsyncSession = Depends(get_db),
):
  query = (
    select(ChatSession)
    .options(selectinload(ChatSession.messages))
    .where(ChatSession.id == session_id)
  )
  result = await session.execute(query)
  chat_session = result.scalar_one_or_none()

  if not chat_session:
    raise HTTPException(status_code=404, detail="Session not found")

  chat_session.name = session_update.name
  await session.commit()
  await session.refresh(chat_session, ["messages"])

  # Ensure messages are loaded by accessing them while session is active
  _ = list(chat_session.messages) if hasattr(chat_session, "messages") else []

  return ChatSessionSchema.model_validate(chat_session)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
  session_id: int,
  session: AsyncSession = Depends(get_db),
):
  """
  Delete a chat session and all its messages.
  Messages are automatically deleted via database CASCADE constraint.
  """
  query = select(ChatSession).where(ChatSession.id == session_id)
  result = await session.execute(query)
  chat_session = result.scalar_one_or_none()

  if not chat_session:
    logger.warning(f"Attempted to delete non-existent session {session_id}")
    raise HTTPException(status_code=404, detail="Session not found")

  logger.info(f"Deleting chat session {session_id} for paper {chat_session.paper_id}")
  await session.delete(chat_session)
  await session.commit()
  return None


@router.delete("/sessions/{session_id}/messages", status_code=204)
async def clear_session_messages(
  session_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Clear all messages from a chat session."""
  # Verify session exists
  session_query = select(ChatSession).where(ChatSession.id == session_id)
  session_result = await session.execute(session_query)
  chat_session = session_result.scalar_one_or_none()

  if not chat_session:
    raise HTTPException(status_code=404, detail="Session not found")

  # Delete all messages for this session
  messages_query = select(ChatMessage).where(ChatMessage.session_id == session_id)
  messages_result = await session.execute(messages_query)
  messages = messages_result.scalars().all()

  for message in messages:
    await session.delete(message)

  await session.commit()
  return None
