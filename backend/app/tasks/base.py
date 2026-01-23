from contextlib import contextmanager
from typing import Generator

from celery import Task
from google import genai
from google.genai import errors as genai_errors
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SyncSessionLocal
from app.core.logger import get_logger

logger = get_logger(__name__)


class PermanentTaskError(Exception):
  """Exception that should NOT be retried (e.g., invalid input, not found)."""

  pass


class BaseTask(Task):
  """Base task with common configuration."""

  abstract = True
  # Only retry on transient errors, not permanent ones
  autoretry_for = (ConnectionError, TimeoutError, OSError)
  dont_autoretry_for = (PermanentTaskError, ValueError, KeyError)
  retry_backoff = True
  retry_backoff_max = 600  # 10 minutes max backoff
  max_retries = 3
  retry_jitter = True
  # Time limits (can be overridden per-task)
  soft_time_limit = 300  # 5 minutes
  time_limit = 360  # 6 minutes

  def on_failure(self, exc, task_id, args, kwargs, einfo):
    """Log task failure."""
    logger.error(
      "Task failed",
      task_name=self.name,
      task_id=task_id,
      args=args,
      error=str(exc),
    )

  def on_retry(self, exc, task_id, args, kwargs, einfo):
    """Log task retry."""
    logger.warning(
      "Task retrying",
      task_name=self.name,
      task_id=task_id,
      args=args,
      error=str(exc),
      retry_count=self.request.retries,
    )

  def on_success(self, retval, task_id, args, kwargs):
    """Log task success."""
    logger.info(
      "Task completed",
      task_name=self.name,
      task_id=task_id,
    )


class BaseAITask(BaseTask):
  """Base task for AI operations with rate limiting and specific error handling."""

  abstract = True
  autoretry_for = (genai_errors.APIError, ConnectionError, TimeoutError)
  retry_backoff = True
  retry_backoff_max = 600
  max_retries = 5
  rate_limit = "10/m"  # 10 tasks per minute
  # AI tasks may take longer (large PDFs)
  soft_time_limit = 240  # 4 minutes
  time_limit = 300  # 5 minutes

  # Per-instance client storage (not class-level to avoid fork issues)
  def __init__(self) -> None:
    super().__init__()
    self._client_instance: genai.Client | None = None

  @property
  def client(self) -> genai.Client | None:
    """Get or create GenAI client per task instance."""
    if not settings.GOOGLE_API_KEY:
      return None
    # Create client per-request to avoid issues with forked workers
    if self._client_instance is None:
      self._client_instance = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return self._client_instance


def get_sync_session() -> Session:
  """Get a synchronous database session for Celery tasks."""
  return SyncSessionLocal()


@contextmanager
def sync_session_scope() -> Generator[Session, None, None]:
  """Provide a transactional scope around a series of operations.

  Usage:
      with sync_session_scope() as session:
          session.query(...)
  """
  session = SyncSessionLocal()
  try:
    yield session
    session.commit()
  except Exception:
    session.rollback()
    raise
  finally:
    session.close()
