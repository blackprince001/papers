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
from app.services.deep_research_service import (
  DeepResearchRetryable,
  run_deep_research,
)
from app.tasks.base import BaseTask

logger = get_logger(__name__)


def _mark_failed_sync(session_id: int, error: str) -> None:
  """Mark a run failed once retries are exhausted (sync — Celery hook context)."""
  from app.models.deep_research import DeepResearchSession
  from app.tasks.base import get_sync_session

  session = get_sync_session()
  try:
    row = (
      session.query(DeepResearchSession)
      .filter(DeepResearchSession.id == session_id)
      .first()
    )
    if row is not None and row.status not in ("completed", "paused"):
      row.status = "failed"
      session.commit()
  except Exception as e:  # noqa: BLE001
    session.rollback()
    logger.warning(
      "Failed to mark deep research failed", session_id=session_id, error=str(e)
    )
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
def run_deep_research_task(
  self, session_id: int, user_id: int | None = None
) -> dict[str, Any]:
  """Execute or resume a deep-research run for ``session_id``."""
  status = run_deep_research(session_id, user_id)
  return {"status": status, "session_id": session_id}
