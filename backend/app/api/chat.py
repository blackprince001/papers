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
  get_visible_paper_or_404,
  list_chat_sessions_for_paper,
)
from app.core.database import stream_db_session
from app.core.logger import get_logger
from app.dependencies import CurrentUser, get_db, scoped_user_id
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
from app.schemas.reference import BatchResolveRequest, BatchResolveResponse
from app.services.ai.agent.error import classify_exception
from app.services.chat import chat_service
from app.services.reference_resolver import resolve_batch

logger = get_logger(__name__)

router = APIRouter()


@router.post("/papers/{paper_id}/chat", response_model=ChatResponse)
async def send_chat_message(
  paper_id: int,
  chat_request: ChatRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  try:
    assistant_message = await chat_service.send_message(
      db_session=session,
      paper_id=paper_id,
      user_message=chat_request.message,
      references=chat_request.references,
      session_id=chat_request.session_id,
      user_id=user.id,
      provider_id=chat_request.provider_id,
      is_admin=user.role == "admin",
    )

    session_id = assistant_message.session_id if assistant_message else None
    chat_session = await get_chat_session_or_404(
      session, cast(int, session_id), with_messages=True, user_id=scoped_user_id(user)
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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  chat_session = await chat_service.get_latest_session(
    db_session=session, paper_id=paper_id, user_id=scoped_user_id(user)
  )

  if not chat_session:
    return None

  chat_session = await get_chat_session_or_404(
    session,
    cast(int, chat_session.id),
    with_messages=True,
    user_id=scoped_user_id(user),
  )
  return ChatSessionSchema.model_validate(chat_session)


@router.post("/papers/{paper_id}/chat/stream")
async def stream_chat_message(
  paper_id: int,
  chat_request: ChatRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  async def generate_stream():
    # Dedicated session for the streaming task (see stream_db_session).
    async with stream_db_session() as stream_session:
      try:
        async for chunk in chat_service.stream_message(
          db_session=stream_session,
          paper_id=paper_id,
          user_message=chat_request.message,
          references=chat_request.references,
          session_id=chat_request.session_id,
          user_id=user.id,
          provider_id=chat_request.provider_id,
          is_admin=user.role == "admin",
        ):
          data = json.dumps(chunk)
          yield f"data: {data}\n\n"
      except Exception as e:
        error_code, recoverable = classify_exception(e)
        error_chunk = {
          "type": "error",
          "error": str(e)[:200],
          "error_code": error_code,
          "recoverable": recoverable,
        }
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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  session_query = select(ChatSession).where(
    ChatSession.paper_id == paper_id, ChatSession.user_id == scoped_user_id(user)
  )
  session_result = await session.execute(session_query)
  chat_sessions = session_result.scalars().all()

  for chat_session in chat_sessions:
    await session.delete(chat_session)

  await session.commit()
  return None


async def _get_thread_parent_or_404(
  session: AsyncSession, message_id: int, user: CurrentUser
):
  """Validate thread parent message exists and its paper is visible to the user."""
  parent_message = await chat_service.get_message_by_id(session, message_id)
  if not parent_message:
    raise HTTPException(status_code=404, detail="Message not found")
  # Verify the paper behind this chat is visible
  chat_session = await get_chat_session_or_404(
    session, cast(int, parent_message.session_id)
  )
  await get_visible_paper_or_404(
    session, cast(int, chat_session.paper_id), user_id=scoped_user_id(user)
  )
  return parent_message


@router.get("/messages/{message_id}/thread", response_model=List[ChatMessageSchema])
async def get_thread_messages(
  message_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Get all replies in a thread."""
  await _get_thread_parent_or_404(session, message_id, user)

  thread_messages = await chat_service.get_thread_messages(session, message_id)
  return [ChatMessageSchema.model_validate(msg) for msg in thread_messages]


@router.post("/messages/{message_id}/thread", response_model=ThreadResponse)
async def send_thread_message(
  message_id: int,
  request: ThreadRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Send a message in a thread and get AI response."""
  await _get_thread_parent_or_404(session, message_id, user)

  try:
    user_msg, assistant_msg = await chat_service.send_thread_message(
      db_session=session,
      parent_message_id=message_id,
      user_message=request.message,
      references=request.references,
      user_id=user.id,
      is_admin=user.role == "admin",
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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Stream AI response in a thread."""
  await _get_thread_parent_or_404(session, message_id, user)

  async def generate_stream():
    # Dedicated session for the streaming task (see stream_db_session).
    async with stream_db_session() as stream_session:
      try:
        async for chunk in chat_service.stream_thread_message(
          db_session=stream_session,
          parent_message_id=message_id,
          user_message=request.message,
          references=request.references,
          user_id=user.id,
        ):
          data = json.dumps(chunk)
          yield f"data: {data}\n\n"
      except Exception as e:
        error_code, recoverable = classify_exception(e)
        error_chunk = {
          "type": "error",
          "error": str(e)[:200],
          "error_code": error_code,
          "recoverable": recoverable,
        }
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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  chat_session = await chat_service.create_session(
    db_session=session,
    paper_id=paper_id,
    name=session_data.name,
    user_id=scoped_user_id(user),
  )

  chat_session = await get_chat_session_or_404(
    session,
    cast(int, chat_session.id),
    with_messages=True,
    user_id=scoped_user_id(user),
  )
  return ChatSessionSchema.model_validate(chat_session)


@router.get("/papers/{paper_id}/sessions", response_model=List[ChatSessionSchema])
async def list_sessions(
  paper_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  sessions = await list_chat_sessions_for_paper(
    session, paper_id, user_id=scoped_user_id(user)
  )
  return [ChatSessionSchema.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=ChatSessionSchema)
async def get_session(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  chat_session = await get_chat_session_or_404(
    session, session_id, with_messages=True, user_id=scoped_user_id(user)
  )
  return ChatSessionSchema.model_validate(chat_session)


@router.patch("/sessions/{session_id}", response_model=ChatSessionSchema)
async def update_session(
  session_id: int,
  session_update: ChatSessionUpdate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  chat_session = await get_chat_session_or_404(
    session, session_id, with_messages=True, user_id=scoped_user_id(user)
  )

  chat_session.name = session_update.name
  await session.commit()
  await session.refresh(chat_session, ["messages"])

  ensure_loaded(chat_session, "messages")
  return ChatSessionSchema.model_validate(chat_session)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  chat_session = await get_chat_session_or_404(
    session, session_id, user_id=scoped_user_id(user)
  )

  logger.info(f"Deleting chat session {session_id} for paper {chat_session.paper_id}")
  await delete_chat_session(session, session_id, user_id=scoped_user_id(user))
  return None


@router.delete("/sessions/{session_id}/messages", status_code=204)
async def clear_session_messages(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  await get_chat_session_or_404(session, session_id, user_id=scoped_user_id(user))

  messages_query = select(ChatMessage).where(ChatMessage.session_id == session_id)
  messages_result = await session.execute(messages_query)
  messages = messages_result.scalars().all()

  for message in messages:
    await session.delete(message)

  await session.commit()
  return None


@router.post("/chat/references/resolve", response_model=BatchResolveResponse)
async def batch_resolve_references(
  request: BatchResolveRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Resolve a batch of ``ref:`` tokens into preview data.

  Used by the frontend for lazy hover previews on older messages that
  don't have a stored manifest, or during streaming before the manifest
  arrives in the ``done`` event.
  """
  entries = await resolve_batch(
    session, scoped_user_id(user), request.refs, paper_id=None
  )
  return BatchResolveResponse(entries=entries)
