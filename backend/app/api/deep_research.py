"""Deep research API — start, stream, list, get, delete, and resume runs.

A run is dispatched to the isolated ``research`` Celery queue and streamed to the
browser by tailing the replayable Redis event list ``deepresearch:{id}:events``.
The stream is reconnectable: on (re)connect it replays the list from the start,
then follows live, closing on a terminal event or terminal DB status.
"""

import asyncio
import json
from typing import Any, AsyncGenerator, List

import redis as redis_sync
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logger import get_logger
from app.dependencies import CurrentUser, get_db, scoped_user_id
from app.models.deep_research import DeepResearchSession
from app.schemas.deep_research import (
  DeepResearchSession as DeepResearchSessionSchema,
)
from app.schemas.deep_research import (
  DeepResearchSessionCreate,
  DeepResearchSessionDetail,
)
from app.tasks.deep_research_tasks import run_deep_research_task

logger = get_logger(__name__)

router = APIRouter()

_TERMINAL_STATUSES = ("completed", "failed", "paused")
_TERMINAL_EVENT_TYPES = ("done", "error", "paused")


def _events_key(session_id: int) -> str:
  return f"deepresearch:{session_id}:events"


def _redis_client() -> "redis_sync.Redis":
  return redis_sync.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True,
  )


async def _get_owned_or_404(
  session: AsyncSession, session_id: int, user: Any
) -> DeepResearchSession:
  result = await session.execute(
    select(DeepResearchSession).where(
      DeepResearchSession.id == session_id,
      DeepResearchSession.user_id == scoped_user_id(user),
    )
  )
  row = result.scalar_one_or_none()
  if not row:
    raise HTTPException(status_code=404, detail="Deep research session not found")
  return row


@router.post("", response_model=DeepResearchSessionSchema)
async def start_deep_research(
  request: DeepResearchSessionCreate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Create a run and dispatch it to the research queue."""
  question = (request.question or "").strip()
  if not question:
    raise HTTPException(status_code=422, detail="A research question is required")

  uid = scoped_user_id(user)
  row = DeepResearchSession(
    user_id=uid,
    question=question,
    title=question[:80],
    status="running",
  )
  session.add(row)
  await session.commit()
  await session.refresh(row)

  run_deep_research_task.apply_async(args=[row.id, uid], queue="research")
  return DeepResearchSessionSchema.model_validate(row)


@router.get("", response_model=List[DeepResearchSessionSchema])
async def list_deep_research(
  user: CurrentUser,
  limit: int = Query(default=50, le=100),
  offset: int = Query(default=0, ge=0),
  session: AsyncSession = Depends(get_db),
):
  stmt = (
    select(DeepResearchSession)
    .where(DeepResearchSession.user_id == scoped_user_id(user))
    .order_by(DeepResearchSession.updated_at.desc())
    .offset(offset)
    .limit(limit)
  )
  result = await session.execute(stmt)
  rows = result.scalars().all()
  return [DeepResearchSessionSchema.model_validate(r) for r in rows]


@router.get("/{session_id}", response_model=DeepResearchSessionDetail)
async def get_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  row = await _get_owned_or_404(session, session_id, user)
  return DeepResearchSessionDetail.model_validate(row)


@router.delete("/{session_id}")
async def delete_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  row = await _get_owned_or_404(session, session_id, user)
  await session.delete(row)
  await session.commit()
  return {"message": "Deep research session deleted", "id": session_id}


@router.post("/{session_id}/resume", response_model=DeepResearchSessionSchema)
async def resume_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Resume a paused run from its checkpoint."""
  row = await _get_owned_or_404(session, session_id, user)
  if row.status != "paused":
    raise HTTPException(
      status_code=409, detail=f"Run is '{row.status}', only paused runs can be resumed"
    )
  uid = scoped_user_id(user)
  row.status = "running"
  await session.commit()
  await session.refresh(row)

  run_deep_research_task.apply_async(args=[row.id, uid], queue="research")
  return DeepResearchSessionSchema.model_validate(row)


@router.get("/{session_id}/stream")
async def stream_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """SSE: replay the run's events, then follow live until it ends.

  Reconnect-safe — the Redis list is read non-destructively from the start, so
  a browser that drops and reopens sees the full progress again.
  """
  await _get_owned_or_404(session, session_id, user)

  async def event_generator() -> AsyncGenerator[str, None]:
    r = _redis_client()
    key = _events_key(session_id)
    offset = 0
    # Dedicated session, created and used entirely inside this streaming task,
    # so its asyncpg connection lifecycle stays put (avoids MissingGreenlet).
    async with AsyncSessionLocal() as db:
      try:
        while True:
          raws = await asyncio.to_thread(r.lrange, key, offset, -1)
          terminal_seen = False
          for raw in raws:
            offset += 1
            yield f"data: {raw}\n\n"
            try:
              if json.loads(raw).get("type") in _TERMINAL_EVENT_TYPES:
                terminal_seen = True
            except (ValueError, TypeError):
              continue
          if terminal_seen:
            break

          # Safety net: if the run finished but its terminal event has expired
          # from Redis (or was never seen), close on the persisted status.
          db.expire_all()
          row = await db.get(DeepResearchSession, session_id)
          if row is not None and row.status in _TERMINAL_STATUSES:
            tail = await asyncio.to_thread(r.lrange, key, offset, -1)
            for raw in tail:
              offset += 1
              yield f"data: {raw}\n\n"
            yield f"data: {json.dumps({'type': 'end', 'status': row.status})}\n\n"
            break

          yield ": keepalive\n\n"
          await asyncio.sleep(1.0)
      except asyncio.CancelledError:
        raise

  return StreamingResponse(
    event_generator(),
    media_type="text/event-stream",
    headers={
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  )
