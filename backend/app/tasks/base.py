"""Base task classes for Celery workers.

Tasks resolve the AI provider per paper owner (``get_provider_for_user_sync``)
— there is no environment-default provider.
"""

from contextlib import contextmanager
from typing import TYPE_CHECKING, Generator

from celery import Task
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SyncSessionLocal
from app.core.logger import get_logger
from app.services.ai.helpers import ProviderLookupError

if TYPE_CHECKING:
  import redis as _redis

logger = get_logger(__name__)


PAPER_PROGRESS_TTL = 3600  # 1 hour — must outlast the longest paper processing

# Maps Celery task names to the pipeline step they report as. Terminal
# markers (completed/skipped/failed) are emitted centrally by BaseAITask
# hooks; tasks only push their own "running" marker.
PROGRESS_STEP_BY_TASK = {
  "ai.generate_summary": "summary",
  "ai.extract_findings": "findings",
  "ai.generate_reading_guide": "reading_guide",
  "ai.generate_highlights": "highlights",
  "ai.generate_embedding": "embedding",
  "processing.extract_citations": "citations",
}


def push_paper_progress(paper_id: int, marker: dict) -> None:
  """Push a progress event for a paper-processing step.

  Consumers can poll ``paper:{paper_id}:progress`` (Redis list) to show
  real-time status in the UI.  Mirrors the discovery progress pattern
  in ``discovery_tasks.py:_push_progress``.
  """
  import json

  r = get_redis()
  key = f"paper:{paper_id}:progress"
  r.rpush(key, json.dumps(marker))
  r.expire(key, PAPER_PROGRESS_TTL)


def get_redis() -> "_redis.Redis":
  """Return a Redis client (decoded responses) for task-side coordination."""
  import redis

  return redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True,
  )


def check_ai_rate_limit(
  user_id: int | None,
  max_requests: int | None = None,
  window_seconds: int = 60,
) -> None:
  """Raise ``RateLimitExceeded`` if *user_id* has hit their per-user AI task cap.

  Uses a Redis sorted set (sliding window) keyed by ``rl:ai:user:{user_id}``.
  When *max_requests* is ``None`` it falls back to ``settings.AI_TASK_RATE_LIMIT``.
  Unknown users (``None``) are never capped.
  """
  if user_id is None:
    return

  import time
  import uuid

  r = get_redis()
  limit = max_requests if max_requests is not None else settings.AI_TASK_RATE_LIMIT
  key = f"rl:ai:user:{user_id}"
  now = time.time()
  window_start = now - window_seconds
  member = f"{now}_{uuid.uuid4().hex}"

  pipe = r.pipeline()
  pipe.zremrangebyscore(key, 0, window_start)
  pipe.zadd(key, {member: now})  # type: ignore[arg-type]
  pipe.zcard(key)
  pipe.expire(key, window_seconds)
  results = pipe.execute()

  count = results[2]
  if count > limit:
    # Rejected attempts must not consume quota, or retries of throttled
    # tasks keep the window saturated and eventually fail permanently.
    r.zrem(key, member)
    raise RateLimitExceeded(
      f"AI task rate limit exceeded ({count}/{limit} per {window_seconds}s)"
      f" for user {user_id}"
    )


class PermanentTaskError(Exception):
  """Exception that should NOT be retried (e.g., invalid input, not found)."""

  pass


class RateLimitExceeded(Exception):
  """Raised when the per-user AI task rate limit is exceeded.

  This IS retried — the rate limit is transient (sliding window resets).
  """

  pass


class BaseTask(Task):
  """Base task with common configuration."""

  abstract = True
  autoretry_for = (ConnectionError, TimeoutError, OSError)
  dont_autoretry_for = (PermanentTaskError, ValueError, KeyError)
  retry_backoff = True
  retry_backoff_max = 600
  max_retries = 3
  retry_jitter = True
  soft_time_limit = 300
  time_limit = 360

  def on_failure(self, exc, task_id, args, kwargs, einfo):
    logger.error(
      "Task failed",
      task_name=self.name,
      task_id=task_id,
      args=args,
      error=str(exc),
    )

  def on_retry(self, exc, task_id, args, kwargs, einfo):
    logger.warning(
      "Task retrying",
      task_name=self.name,
      task_id=task_id,
      args=args,
      error=str(exc),
      retry_count=self.request.retries,
    )

  def on_success(self, retval, task_id, args, kwargs):
    logger.info(
      "Task completed",
      task_name=self.name,
      task_id=task_id,
    )


class BaseAITask(BaseTask):
  """Base task for AI operations with per-user rate limiting and retry support.

  Tasks resolve the provider per paper owner via
  ``get_provider_for_user_sync``; there is no environment-default provider.
  A failed provider lookup (``ProviderLookupError``) is retried rather than
  reported as "no provider", which previously caused spurious skips under
  load (e.g., the parallel processing chord on bulk ingestion).

  Per-user rate limiting (``RateLimitExceeded``) replaces the former global
  Celery ``task_rate_limit`` — individual tasks call
  ``check_ai_rate_limit(user_id)`` in their body.
  """

  abstract = True
  autoretry_for = (
    ConnectionError,
    TimeoutError,
    OSError,
    ProviderLookupError,
    RateLimitExceeded,
  )
  retry_backoff = True
  retry_backoff_max = 600
  max_retries = 5
  soft_time_limit = 240
  time_limit = 300

  def _push_step_marker(self, args, kwargs, marker: dict) -> None:
    step = PROGRESS_STEP_BY_TASK.get(self.name or "")
    if not step:
      return
    paper_id = args[0] if args else kwargs.get("paper_id")
    if not isinstance(paper_id, int):
      return
    try:
      push_paper_progress(paper_id, {"step": step, **marker})
    except Exception as e:
      logger.warning("Failed to push progress marker", task_name=self.name, error=str(e))

  def on_success(self, retval, task_id, args, kwargs):
    if isinstance(retval, dict):
      status = {"success": "completed", "skipped": "skipped"}.get(
        retval.get("status", ""), "failed"
      )
      marker: dict = {"status": status}
      for key in ("reason", "error", "count", "anchored", "citations_count"):
        if key in retval:
          marker[key] = retval[key]
      self._push_step_marker(args, kwargs, marker)
    super().on_success(retval, task_id, args, kwargs)

  def on_failure(self, exc, task_id, args, kwargs, einfo):
    self._push_step_marker(args, kwargs, {"status": "failed", "error": str(exc)})
    super().on_failure(exc, task_id, args, kwargs, einfo)


def get_sync_session() -> Session:
  """Get a synchronous database session for Celery tasks."""
  return SyncSessionLocal()


@contextmanager
def sync_session_scope() -> Generator[Session, None, None]:
  """Provide a transactional scope around a series of operations."""
  session = SyncSessionLocal()
  try:
    yield session
    session.commit()
  except Exception:
    session.rollback()
    raise
  finally:
    session.close()
