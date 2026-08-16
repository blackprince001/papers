"""Deep research API — start, stream, list, get, delete, and resume runs.

A run is dispatched to the isolated ``research`` Celery queue and streamed to the
browser from the durable Postgres event store. Redis remains a compatibility relay,
not the replay source. The stream resumes from an opaque generation/sequence cursor
and closes on one durable terminal event or terminal DB status.
"""

import asyncio
import json
from typing import Any, AsyncGenerator, List

import redis as redis_sync
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logger import get_logger
from app.dependencies import CurrentUser, get_db
from app.models.deep_research import DeepResearchGeneration, DeepResearchSession
from app.schemas.deep_research import (
  DeepResearchSession as DeepResearchSessionSchema,
)
from app.schemas.deep_research import (
  DeepResearchSessionCreate,
  DeepResearchSessionDetail,
)
from app.services.deep_research.event_store import (
  EventStore,
  InvalidCursor,
  decode_cursor,
  encode_cursor,
)
from app.services.deep_research.orchestrator import (
  enqueue_generation,
  request_cancellation,
)
from app.tasks.deep_research_tasks import dispatch_research_outbox

logger = get_logger(__name__)

router = APIRouter()

_TERMINAL_STATUSES = ("completed", "failed", "paused", "cancelled")
_TERMINAL_EVENT_TYPES = ("done", "error", "paused", "cancelled")
_ACTIVE_STATUSES = ("running", "queued", "planning", "searching", "reading", "synthesizing", "verifying", "cancel_requested")


async def _enforce_active_run_limit(session: AsyncSession, user_id: int | None) -> None:
  """Serialize the per-user count and reject excess active runs."""
  # A missing scoped owner (the current administrator/orphan compatibility
  # path) uses one global budget rather than bypassing the cap.
  lock_key = 91827 + user_id if user_id is not None else 91827
  await session.execute(select(func.pg_advisory_xact_lock(lock_key)))
  active_query = select(func.count(DeepResearchSession.id)).where(
    DeepResearchSession.status.in_(_ACTIVE_STATUSES),
  )
  if user_id is not None:
    active_query = active_query.where(DeepResearchSession.user_id == user_id)
  result = await session.execute(active_query)
  active_count = result.scalar_one()
  if active_count >= settings.DEEP_RESEARCH_MAX_ACTIVE_RUNS:
    raise HTTPException(
      status_code=429,
      detail="Too many active deep-research runs",
      headers={"Retry-After": "60"},
    )


def _ensure_mutations_enabled() -> None:
  """Keep the known-unsafe legacy start/resume path frozen by default."""
  if not settings.DEEP_RESEARCH_MUTATIONS_ENABLED:
    raise HTTPException(
      status_code=503,
      detail="Deep research starts and resumes are temporarily disabled while the service is being rebuilt",
    )


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
      DeepResearchSession.user_id == user.id,
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
  idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
  """Create a run and dispatch it to the research queue."""
  _ensure_mutations_enabled()
  question = (request.question or "").strip()
  if not question:
    raise HTTPException(status_code=422, detail="A research question is required")

  uid = user.id
  key = idempotency_key.strip() if idempotency_key else None
  if key and len(key) > 255:
    raise HTTPException(status_code=422, detail="Idempotency-Key is too long")
  if key:
    existing = (
      await session.execute(
        select(DeepResearchSession).where(
          DeepResearchSession.user_id == uid,
          DeepResearchSession.idempotency_key == key,
        )
      )
    ).scalar_one_or_none()
    if existing is not None:
      if existing.question != question:
        raise HTTPException(
          status_code=409,
          detail="Idempotency-Key was already used for another request",
        )
      return DeepResearchSessionSchema.model_validate(existing)
  await _enforce_active_run_limit(session, uid)
  row = DeepResearchSession(
    user_id=uid,
    question=question,
    title=question[:80],
    status="queued",
    idempotency_key=key,
  )
  session.add(row)
  await session.flush()
  generation = DeepResearchGeneration(
    session_id=row.id,
    generation_number=1,
    status="queued",
    correlation_id=row.correlation_id,
  )
  session.add(generation)
  await session.flush()
  await enqueue_generation(session, session=row, generation=generation)
  try:
    await session.commit()
  except IntegrityError:
    await session.rollback()
    if not key:
      raise
    existing = (
      await session.execute(
        select(DeepResearchSession).where(
          DeepResearchSession.user_id == uid,
          DeepResearchSession.idempotency_key == key,
        )
      )
    ).scalar_one()
    if existing.question != question:
      raise HTTPException(
        status_code=409,
        detail="Idempotency-Key was already used for another request",
      ) from None
    return DeepResearchSessionSchema.model_validate(existing)
  await session.refresh(row)

  try:
    dispatch_research_outbox.delay()
  except Exception as exc:  # the periodic dispatcher will recover this row
    logger.warning("Research outbox wake-up failed", session_id=row.id, error=str(exc))
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
    .where(DeepResearchSession.user_id == user.id)
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


@router.post("/{session_id}/cancel", response_model=DeepResearchSessionSchema)
async def cancel_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Request cooperative cancellation; a worker emits the terminal event."""
  row = await _get_owned_or_404(session, session_id, user)
  await request_cancellation(session, row)
  await session.refresh(row)
  return DeepResearchSessionSchema.model_validate(row)


@router.delete("/{session_id}")
async def delete_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  row = await _get_owned_or_404(session, session_id, user)
  if row.status not in ("completed", "failed", "cancelled", "paused"):
    await request_cancellation(session, row)
    return {"message": "Deep research cancellation requested", "id": session_id}
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
  _ensure_mutations_enabled()
  row = await _get_owned_or_404(session, session_id, user)
  if row.status != "paused":
    raise HTTPException(
      status_code=409, detail=f"Run is '{row.status}', only paused runs can be resumed"
    )
  uid = user.id
  await _enforce_active_run_limit(session, uid)
  await session.refresh(row)
  if row.status != "paused":
    raise HTTPException(
      status_code=409, detail=f"Run is '{row.status}', only paused runs can be resumed"
    )
  next_generation = (await session.execute(
    select(func.coalesce(func.max(DeepResearchGeneration.generation_number), 0) + 1).where(
      DeepResearchGeneration.session_id == row.id
    )
  )).scalar_one()
  row.current_generation = next_generation
  row.status = "queued"
  generation = DeepResearchGeneration(
    session_id=row.id,
    generation_number=next_generation,
    status="queued",
    correlation_id=row.correlation_id,
  )
  session.add(generation)
  await session.flush()
  await enqueue_generation(session, session=row, generation=generation)
  await session.commit()
  await session.refresh(row)

  try:
    dispatch_research_outbox.delay()
  except Exception as exc:  # the periodic dispatcher will recover this row
    logger.warning("Research outbox wake-up failed", session_id=row.id, error=str(exc))
  return DeepResearchSessionSchema.model_validate(row)


@router.get("/{session_id}/stream")
async def stream_deep_research(
  session_id: int,
  request: Request,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Stream durable events for the current generation.

  ``Last-Event-ID`` (or ``cursor``) is an opaque signed generation/sequence
  cursor. A cursor from an older generation is rejected instead of replaying
  events from the wrong execution.
  """
  await _get_owned_or_404(session, session_id, user)
  cursor_value = request.headers.get("last-event-id") or request.query_params.get("cursor")
  try:
    cursor_generation, cursor_sequence = decode_cursor(cursor_value) if cursor_value else (None, 0)
  except InvalidCursor as exc:
    raise HTTPException(status_code=400, detail="Invalid event cursor") from exc

  store = EventStore()
  current_generation = (
    await store.generation(session, session_id)
  )
  if current_generation is None:
    raise HTTPException(status_code=404, detail="Research generation not found")
  if cursor_generation is not None and cursor_generation != current_generation.generation_number:
    raise HTTPException(status_code=409, detail="Event cursor belongs to a stale generation")

  async def event_generator() -> AsyncGenerator[str, None]:
    offset = cursor_sequence
    generation_number = int(current_generation.generation_number)
    generation_id = int(current_generation.id)
    async with AsyncSessionLocal() as db:
      try:
        while True:
          events = await store.after(
            db,
            generation_id=generation_id,
            after_sequence=offset,
          )
          terminal_seen = False
          for event in events:
            offset = event.sequence
            event_id = encode_cursor(generation_number, event.sequence)
            payload = json.dumps(event.payload, ensure_ascii=False)
            yield f"event: {event.event_type}\nid: {event_id}\ndata: {payload}\n\n"
            if event.event_type in _TERMINAL_EVENT_TYPES:
              terminal_seen = True
          if terminal_seen:
            break

          db.expire_all()
          row = await db.get(DeepResearchSession, session_id)
          if row is not None and row.status in (*_TERMINAL_STATUSES, "cancelled"):
            yield f"event: end\ndata: {json.dumps({'type': 'end', 'status': row.status})}\n\n"
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
