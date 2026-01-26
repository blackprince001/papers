"""Chat API endpoints."""

import json
from typing import List, Optional, cast

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import (
  delete_chat_session,
  ensure_loaded,
  get_chat_session_or_404,
  get_paper_or_404,
  list_chat_sessions_for_paper,
)
from app.core.logger import get_logger
from app.dependencies import get_db
from app.models.chat import ChatMessage, ChatSession
from app.schemas.chat import (
  ChatMessage as ChatMessageSchema,
)
from app.schemas.chat import (
  ChatRequest,
  ChatResponse,
  ChatSessionCreate,
  ChatSessionUpdate,
  ThreadRequest,
  ThreadResponse,
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
  """Send a message to chat about a paper."""
  await get_paper_or_404(session, paper_id)

  try:
    assistant_message = await chat_service.send_message(
      db_session=session,
      paper_id=paper_id,
      user_message=chat_request.message,
      references=chat_request.references,
      session_id=chat_request.session_id,
    )

    session_id = assistant_message.session_id if assistant_message else None
    chat_session = await get_chat_session_or_404(
      session, cast(int, session_id), with_messages=True
    )

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
  """Get the latest chat session for a paper."""
  await get_paper_or_404(session, paper_id)

  chat_session = await chat_service.get_latest_session(
    db_session=session, paper_id=paper_id
  )

  if not chat_session:
    return None

  chat_session = await get_chat_session_or_404(
    session, cast(int, chat_session.id), with_messages=True
  )
  return ChatSessionSchema.model_validate(chat_session)


@router.post("/papers/{paper_id}/chat/stream")
async def stream_chat_message(
  paper_id: int,
  chat_request: ChatRequest,
  session: AsyncSession = Depends(get_db),
):
  """Stream a chat message response."""
  await get_paper_or_404(session, paper_id)

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
  """Clear all chat sessions for a paper."""
  await get_paper_or_404(session, paper_id)

  session_query = select(ChatSession).where(ChatSession.paper_id == paper_id)
  session_result = await session.execute(session_query)
  chat_sessions = session_result.scalars().all()

  for chat_session in chat_sessions:
    await session.delete(chat_session)

  await session.commit()
  return None


@router.get("/messages/{message_id}/thread", response_model=List[ChatMessageSchema])
async def get_thread_messages(
  message_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Get all replies in a thread."""
  parent_message = await chat_service.get_message_by_id(session, message_id)
  if not parent_message:
    raise HTTPException(status_code=404, detail="Message not found")

  thread_messages = await chat_service.get_thread_messages(session, message_id)
  return [ChatMessageSchema.model_validate(msg) for msg in thread_messages]


@router.post("/messages/{message_id}/thread", response_model=ThreadResponse)
async def send_thread_message(
  message_id: int,
  request: ThreadRequest,
  session: AsyncSession = Depends(get_db),
):
  """Send a message in a thread and get AI response."""
  try:
    user_msg, assistant_msg = await chat_service.send_thread_message(
      db_session=session,
      parent_message_id=message_id,
      user_message=request.message,
      references=request.references,
    )

    parent_message = await chat_service.get_message_by_id(session, message_id)
    if not parent_message:
      raise HTTPException(status_code=404, detail="Parent message not found")

    return ThreadResponse(
      message=ChatMessageSchema.model_validate(assistant_msg),
      parent_message=ChatMessageSchema.model_validate(parent_message),
    )
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e)) from e
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Failed to send thread message: {str(e)}"
    ) from e


@router.post("/messages/{message_id}/thread/stream")
async def stream_thread_message(
  message_id: int,
  request: ThreadRequest,
  session: AsyncSession = Depends(get_db),
):
  """Stream AI response in a thread."""
  parent_message = await chat_service.get_message_by_id(session, message_id)
  if not parent_message:
    raise HTTPException(status_code=404, detail="Message not found")

  async def generate_stream():
    try:
      async for chunk in chat_service.stream_thread_message(
        db_session=session,
        parent_message_id=message_id,
        user_message=request.message,
        references=request.references,
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


@router.post("/papers/{paper_id}/sessions", response_model=ChatSessionSchema)
async def create_new_session(
  paper_id: int,
  session_data: ChatSessionCreate,
  session: AsyncSession = Depends(get_db),
):
  """Create a new chat session for a paper."""
  await get_paper_or_404(session, paper_id)

  chat_session = await chat_service.create_session(
    db_session=session, paper_id=paper_id, name=session_data.name
  )

  chat_session = await get_chat_session_or_404(
    session, cast(int, chat_session.id), with_messages=True
  )
  return ChatSessionSchema.model_validate(chat_session)


@router.get("/papers/{paper_id}/sessions", response_model=List[ChatSessionSchema])
async def list_sessions(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """List all chat sessions for a paper."""
  sessions = await list_chat_sessions_for_paper(session, paper_id)
  return [ChatSessionSchema.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=ChatSessionSchema)
async def get_session(
  session_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Get a single chat session by ID."""
  chat_session = await get_chat_session_or_404(session, session_id, with_messages=True)
  return ChatSessionSchema.model_validate(chat_session)


@router.patch("/sessions/{session_id}", response_model=ChatSessionSchema)
async def update_session(
  session_id: int,
  session_update: ChatSessionUpdate,
  session: AsyncSession = Depends(get_db),
):
  """Update a chat session."""
  chat_session = await get_chat_session_or_404(session, session_id, with_messages=True)

  chat_session.name = session_update.name
  await session.commit()
  await session.refresh(chat_session, ["messages"])

  ensure_loaded(chat_session, "messages")
  return ChatSessionSchema.model_validate(chat_session)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
  session_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Delete a chat session and all its messages."""
  chat_session = await get_chat_session_or_404(session, session_id)

  logger.info(f"Deleting chat session {session_id} for paper {chat_session.paper_id}")
  await delete_chat_session(session, session_id)
  return None


@router.delete("/sessions/{session_id}/messages", status_code=204)
async def clear_session_messages(
  session_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Clear all messages from a chat session."""
  await get_chat_session_or_404(session, session_id)

  messages_query = select(ChatMessage).where(ChatMessage.session_id == session_id)
  messages_result = await session.execute(messages_query)
  messages = messages_result.scalars().all()

  for message in messages:
    await session.delete(message)

  await session.commit()
  return None
