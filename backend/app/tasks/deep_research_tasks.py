"""Celery task for deep-research runs.

Runs on the dedicated ``research`` queue (isolated from the ``ai`` queue so a
multi-minute run never starves fast AI features). The run is **resumable**:
``DeepResearchRetryable`` — raised by the service on a recoverable error, a
soft-time-limit, or the segment-budget cap — triggers a Celery retry that
re-runs the task; the service then loads ``run_state`` and continues from the
last checkpoint. There is deliberately no per-user rate limit.
"""

from typing import Any

from app.celery_app import celery_app
from app.core.logger import get_logger
from app.services.deep_research.orchestrator import (
  GenerationNotRunnable,
  claim_generation_sync,
  claim_outbox_batch_sync,
  mark_outbox_published_sync,
  recover_expired_generation_leases_sync,
  release_outbox_sync,
)
from app.services.deep_research_service import DeepResearchRetryable, run_deep_research
from app.tasks.base import BaseTask

logger = get_logger(__name__)


def _mark_failed_sync(session_id: int, error: str) -> None:
  """Atomically mark the current generation failed and append its terminal event."""
  import json
  from datetime import datetime, timezone

  from app.models.deep_research import (
    DeepResearchEvent,
    DeepResearchGeneration,
    DeepResearchSession,
  )
  from app.tasks.base import get_sync_session

  session = get_sync_session()
  try:
    row = (
      session.query(DeepResearchSession)
      .filter(DeepResearchSession.id == session_id)
      .with_for_update()
      .first()
    )
    if row is None or row.status in ("completed", "paused", "cancelled", "cancel_requested"):
      session.rollback()
      return
    generation = (
      session.query(DeepResearchGeneration)
      .filter(
        DeepResearchGeneration.session_id == session_id,
        DeepResearchGeneration.generation_number == row.current_generation,
      )
      .with_for_update()
      .one_or_none()
    )
    row.status = "failed"
    row.last_error_code = "worker_failure"
    row.lifecycle_version = (row.lifecycle_version or 0) + 1
    if generation is not None:
      generation.status = "failed"
      generation.lease_until = None
      generation.finished_at = datetime.now(timezone.utc)
      generation.state_version = (generation.state_version or 0) + 1
      terminal = (
        session.query(DeepResearchEvent.id)
        .filter(
          DeepResearchEvent.generation_id == generation.id,
          DeepResearchEvent.event_type.in_(("done", "error", "paused", "cancelled")),
        )
        .first()
      )
      if terminal is None:
        payload = {
          "type": "error",
          "error": "Research worker failed before completion.",
          "error_code": "worker_failure",
          "recoverable": False,
        }
        encoded = json.dumps(payload, separators=(",", ":")).encode()
        sequence = (generation.last_event_sequence or 0) + 1
        generation.last_event_sequence = sequence
        row.last_event_sequence = sequence
        session.add(
          DeepResearchEvent(
            session_id=row.id,
            generation_id=generation.id,
            sequence=sequence,
            event_type="error",
            payload=payload,
            payload_bytes=len(encoded),
            correlation_id=row.correlation_id,
          )
        )
    session.commit()
  except Exception as exc:  # noqa: BLE001
    session.rollback()
    logger.warning(
      "Failed to persist deep-research terminal failure",
      session_id=session_id,
      error=str(exc),
    )
  finally:
    session.close()


def _finalize_cancelled_sync(session_id: int, generation_id: int) -> bool:
  """Write the terminal cancellation when delivery sees a pre-start request."""
  import json
  from datetime import datetime, timezone

  from app.models.deep_research import (
    DeepResearchEvent,
    DeepResearchGeneration,
    DeepResearchSession,
  )
  from app.tasks.base import get_sync_session

  session = get_sync_session()
  try:
    research = (
      session.query(DeepResearchSession)
      .filter(DeepResearchSession.id == session_id)
      .with_for_update()
      .one_or_none()
    )
    generation = (
      session.query(DeepResearchGeneration)
      .filter(DeepResearchGeneration.id == generation_id)
      .with_for_update()
      .one_or_none()
    )
    if research is None or generation is None or not research.cancel_requested:
      session.rollback()
      return False
    research.status = "cancelled"
    research.lifecycle_version = (research.lifecycle_version or 0) + 1
    generation.status = "cancelled"
    generation.lease_until = None
    generation.finished_at = datetime.now(timezone.utc)
    generation.state_version = (generation.state_version or 0) + 1
    terminal = (
      session.query(DeepResearchEvent.id)
      .filter(
        DeepResearchEvent.generation_id == generation.id,
        DeepResearchEvent.event_type.in_(("done", "error", "paused", "cancelled")),
      )
      .first()
    )
    if terminal is None:
      payload = {"type": "cancelled", "error": "Research cancelled", "recoverable": False}
      generation.last_event_sequence = (generation.last_event_sequence or 0) + 1
      research.last_event_sequence = generation.last_event_sequence
      session.add(
        DeepResearchEvent(
          session_id=research.id,
          generation_id=generation.id,
          sequence=generation.last_event_sequence,
          event_type="cancelled",
          payload=payload,
          payload_bytes=len(json.dumps(payload, separators=(",", ":")).encode()),
          correlation_id=research.correlation_id,
        )
      )
    session.commit()
    return True
  except Exception as exc:  # noqa: BLE001
    session.rollback()
    logger.warning("Failed to finalize requested cancellation", session_id=session_id, error=str(exc))
    return False
  finally:
    session.close()


class DeepResearchTask(BaseTask):
  """Base task: resume from checkpoint on retryable failures; mark failed when
  retries are exhausted. Long time limits — isolated on the ``research`` queue."""

  abstract = True
  autoretry_for = (DeepResearchRetryable, ConnectionError, TimeoutError, OSError)
  retry_backoff = True
  retry_backoff_max = 600
  max_retries = 8
  soft_time_limit = 1500
  time_limit = 1560

  def on_failure(self, exc, task_id, args, kwargs, einfo):
    session_id = args[0] if args else kwargs.get("session_id")
    if isinstance(session_id, int):
      _mark_failed_sync(session_id, str(exc))
    super().on_failure(exc, task_id, args, kwargs, einfo)


@celery_app.task(bind=True, base=DeepResearchTask, name="research.run_deep_research")
def run_deep_research_task(self, session_id: int, generation_id: int) -> dict[str, Any]:
  """Run one leased generation; duplicate Celery deliveries are harmless."""
  from app.tasks.base import get_sync_session

  sync_session = get_sync_session()
  try:
    try:
      user_id, is_admin, lease_token = claim_generation_sync(
        sync_session, session_id, generation_id
      )
    except GenerationNotRunnable as exc:
      sync_session.rollback()
      if "Cancellation requested" in str(exc):
        _finalize_cancelled_sync(session_id, generation_id)
      logger.info(
        "Ignoring duplicate or stale research delivery",
        session_id=session_id,
        generation_id=generation_id,
        reason=str(exc),
      )
      return {"status": "ignored", "session_id": session_id, "generation_id": generation_id}
  finally:
    sync_session.close()
  status = run_deep_research(session_id, user_id, is_admin, generation_id, lease_token)
  return {"status": status, "session_id": session_id, "generation_id": generation_id}


@celery_app.task(name="research.dispatch_outbox")
def dispatch_research_outbox(limit: int = 20) -> dict[str, int]:
  """Publish durable research dispatches after their database transaction commits."""
  from app.tasks.base import get_sync_session

  session = get_sync_session()
  try:
    recovered = recover_expired_generation_leases_sync(session, limit=limit)
    rows = claim_outbox_batch_sync(session, limit=limit)
  finally:
    session.close()

  logger.info("Research outbox reconciliation", recovered=recovered, leased=len(rows))
  published = 0
  failed = 0
  for row in rows:
    try:
      payload = row.payload or {}
      run_deep_research_task.apply_async(
        args=[payload["session_id"], payload["generation_id"]], queue="research"
      )
      session = get_sync_session()
      try:
        mark_outbox_published_sync(session, row.id)
      finally:
        session.close()
      logger.info(
        "Research outbox dispatched",
        outbox_id=row.id,
        attempts=row.attempts,
      )
      published += 1
    except Exception as exc:  # noqa: BLE001 -- outbox records broker failure for retry
      logger.warning("Research outbox dispatch failed", outbox_id=row.id, error=str(exc))
      session = get_sync_session()
      try:
        release_outbox_sync(session, row.id, str(exc))
      finally:
        session.close()
      failed += 1
  return {"published": published, "failed": failed, "recovered": recovered}
