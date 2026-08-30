"""Deep research API — start, stream, list, get, delete, and resume runs.

A run is dispatched to the isolated ``research`` Celery queue and streamed to the
browser from the durable Postgres event store. The stream resumes from an opaque
generation/sequence cursor and closes on one durable terminal event or terminal DB
status.
"""

import asyncio
import json
from typing import Any, AsyncGenerator, List
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logger import get_logger
from app.dependencies import CurrentUser, get_db
from app.models.deep_research import (
  DeepResearchEvidence,
  DeepResearchGeneration,
  DeepResearchSession,
)
from app.schemas.deep_research import (
  DeepResearchArchiveResponse,
  DeepResearchFollowUpCreate,
  DeepResearchFollowUpResponse,
  DeepResearchGenerationSummary,
  DeepResearchSessionCreate,
  DeepResearchSessionDetail,
)
from app.schemas.deep_research import (
  DeepResearchMessage as DeepResearchMessageSchema,
)
from app.schemas.deep_research import (
  DeepResearchSession as DeepResearchSessionSchema,
)
from app.services.ai.agent.provider_resolver import resolve_providers
from app.services.deep_research.conversation import (
  FollowUpExecutionError,
  FollowUpNotAllowed,
  FollowUpProviderUnavailable,
  answer_from_evidence,
  append_message,
  ensure_initial_messages,
  find_idempotent_message,
  list_projected_messages,
  message_projection,
)
from app.services.deep_research.event_store import (
  EventStore,
  InvalidCursor,
  decode_cursor,
  encode_cursor,
)
from app.services.deep_research.orchestrator import (
  FollowUpNotAllowed as ResearchFollowUpNotAllowed,
)
from app.services.deep_research.orchestrator import (
  create_research_follow_up,
  enqueue_generation,
  request_cancellation,
)
from app.services.deep_research.telemetry import record_metric
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


_PHASES = {
  "queued": ("queued", 0),
  "planning": ("planning", 10),
  "searching": ("searching", 30),
  "reading": ("reading", 55),
  "synthesizing": ("synthesizing", 72),
  "verifying": ("verifying", 88),
  "running": ("searching", 30),
  "completed": ("complete", 100),
  "paused": ("paused", 0),
  "failed": ("failed", 100),
  "cancel_requested": ("cancelling", 95),
  "cancelled": ("cancelled", 100),
}


async def _generation_summary(
  session: AsyncSession, row: DeepResearchSession
) -> DeepResearchGenerationSummary | None:
  generation = (
    await session.execute(
      select(DeepResearchGeneration).where(
        DeepResearchGeneration.session_id == row.id,
        DeepResearchGeneration.generation_number == row.current_generation,
      )
    )
  ).scalar_one_or_none()
  if generation is None:
    return None

  source_count = (
    await session.execute(
      select(func.count(DeepResearchEvidence.id)).where(
        DeepResearchEvidence.generation_id == generation.id,
        DeepResearchEvidence.authorization_status == "verified",
      )
    )
  ).scalar_one()
  status = str(generation.status or row.status)
  phase, progress = _PHASES.get(status, (status, 0))
  if status == "completed":
    verification = "verified" if int(source_count or 0) > 0 else "insufficient_evidence"
  elif status in {"paused", "failed", "cancelled"}:
    verification = "needs_attention"
  elif status == "verifying":
    verification = "in_progress"
  else:
    verification = "pending"
  return DeepResearchGenerationSummary(
    id=int(generation.id),
    generation_number=int(generation.generation_number),
    mode=generation.mode or "research",
    status=status,
    provider_type=generation.provider_type,
    model=generation.model,
    scope="Library + academic literature + web discovery",
    effort="Deep",
    phase=phase,
    progress=progress,
    source_count=int(source_count or 0),
    verification_status=verification,
    stop_reason=row.last_error_code,
    started_at=generation.started_at,
    finished_at=generation.finished_at,
  )


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
  if request.provider_id is not None:
    resolved = await resolve_providers(
      session,
      uid,
      preferred_provider_id=request.provider_id,
    )
    if not resolved or resolved[0].provider_id != request.provider_id:
      raise HTTPException(status_code=409, detail="Selected AI provider is unavailable")
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
    mode="research",
    provider_id=request.provider_id,
    correlation_id=row.correlation_id,
  )
  session.add(generation)
  await session.flush()
  await append_message(
    session,
    session_id=int(row.id),
    generation_id=int(generation.id),
    role="user",
    mode="research",
    content=question,
    payload={"mode": "research", "kind": "initial"},
  )
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
  record_metric("run_admitted", mode="research", status="queued", phase="queued")
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


@router.get("/archive", response_model=DeepResearchArchiveResponse)
async def archive_deep_research(
  user: CurrentUser,
  q: str | None = Query(default=None, max_length=200),
  limit: int = Query(default=20, ge=1, le=100),
  offset: int = Query(default=0, ge=0),
  session: AsyncSession = Depends(get_db),
):
  """Return a bounded, searchable archive page for the current user."""
  query = q.strip() if q else ""
  base = select(DeepResearchSession).where(DeepResearchSession.user_id == user.id)
  count_stmt = select(func.count(DeepResearchSession.id)).where(
    DeepResearchSession.user_id == user.id
  )
  if query:
    pattern = f"%{query}%"
    predicate = DeepResearchSession.question.ilike(pattern) | DeepResearchSession.title.ilike(pattern)
    base = base.where(predicate)
    count_stmt = count_stmt.where(predicate)
  total = int((await session.execute(count_stmt)).scalar_one() or 0)
  rows = (
    await session.execute(
      base.order_by(DeepResearchSession.updated_at.desc())
      .offset(offset)
      .limit(limit)
    )
  ).scalars().all()
  return DeepResearchArchiveResponse(
    items=[DeepResearchSessionSchema.model_validate(row) for row in rows],
    total=total,
    limit=limit,
    offset=offset,
    has_more=offset + len(rows) < total,
  )


@router.get("/{session_id}", response_model=DeepResearchSessionDetail)
async def get_deep_research(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  row = await _get_owned_or_404(session, session_id, user)
  detail = DeepResearchSessionDetail.model_validate(row)
  detail.generation = await _generation_summary(session, row)
  return detail


@router.get("/{session_id}/messages", response_model=List[DeepResearchMessageSchema])
async def list_deep_research_messages(
  session_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Return the durable conversation without exposing internal payloads."""
  row = await _get_owned_or_404(session, session_id, user)
  generation = await EventStore().generation(session, session_id)
  if generation is None:
    raise HTTPException(status_code=404, detail="Research generation not found")
  await ensure_initial_messages(session, session=row, generation=generation)
  await session.commit()
  return await list_projected_messages(session, session_id=session_id)


@router.post(
  "/{session_id}/messages",
  response_model=DeepResearchFollowUpResponse,
)
async def create_deep_research_follow_up(
  session_id: int,
  request: DeepResearchFollowUpCreate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
  idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
  """Handle an explicit evidence-only Ask or a guarded Research further turn."""
  _ensure_mutations_enabled()
  question = request.question.strip()
  if not question:
    raise HTTPException(status_code=422, detail="A follow-up question is required")
  key = idempotency_key.strip() if idempotency_key else str(uuid4())
  if not key or len(key) > 255:
    raise HTTPException(status_code=422, detail="Idempotency-Key is too long")

  row = await _get_owned_or_404(session, session_id, user)
  existing = await find_idempotent_message(
    session, session_id=session_id, idempotency_key=key
  )
  if existing is None and request.mode == "research":
    await _enforce_active_run_limit(session, user.id)

  if request.mode == "ask":
    try:
      result = await answer_from_evidence(
        session,
        session=row,
        user_id=int(user.id),
        is_admin=user.role == "admin",
        question=question,
        idempotency_key=key,
      )
    except FollowUpNotAllowed as exc:
      raise HTTPException(status_code=409, detail=str(exc)) from exc
    except FollowUpProviderUnavailable as exc:
      raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FollowUpExecutionError as exc:
      raise HTTPException(
        status_code=502,
        detail="The evidence-only answer could not be generated",
      ) from exc
    generation_number = result.generation_number
  else:
    try:
      result = await create_research_follow_up(
        session,
        session=row,
        question=question,
        idempotency_key=key,
      )
    except ResearchFollowUpNotAllowed as exc:
      raise HTTPException(status_code=409, detail=str(exc)) from exc
    generation_number = int(result.generation.generation_number)
    if existing is None:
      try:
        dispatch_research_outbox.delay()
      except Exception as exc:  # periodic dispatch will recover the row
        logger.warning("Research follow-up wake-up failed", session_id=session_id, error=str(exc))

    record_metric("follow_up_admitted", mode="research", status="queued", phase="queued")

  await session.refresh(row)
  assistant = None
  if result.assistant_message is not None:
    assistant = message_projection(result.assistant_message, generation_number)
  return {
    "mode": request.mode,
    "status": row.status,
    "generation_number": generation_number,
    "message": message_projection(result.user_message, generation_number),
    "assistant_message": assistant,
    "session": DeepResearchSessionSchema.model_validate(row),
  }


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
  record_metric(
    "cancellation_requested",
    status=str(row.status),
    cancel_requested=row.cancel_requested,
  )
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
  if row.last_error_code == "legacy_checkpoint_migrated":
    raise HTTPException(
      status_code=409,
      detail=(
        "This run was paused during a lifecycle upgrade. Its report remains "
        "available, but the old worker cannot be resumed; start a new research run."
      ),
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
  previous_generation = (
    await session.execute(
      select(DeepResearchGeneration).where(
        DeepResearchGeneration.session_id == row.id,
        DeepResearchGeneration.generation_number == row.current_generation,
      )
    )
  ).scalar_one_or_none()
  row.current_generation = next_generation
  row.status = "queued"
  generation = DeepResearchGeneration(
    session_id=row.id,
    generation_number=next_generation,
    mode="research",
    status="queued",
    provider_id=previous_generation.provider_id if previous_generation else None,
    provider_type=previous_generation.provider_type if previous_generation else None,
    model=previous_generation.model if previous_generation else None,
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
