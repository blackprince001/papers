from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel

from app.celery_app import celery_app
from app.core.logger import get_logger

logger = get_logger(__name__)


class TaskState(str, Enum):
  """Celery task states."""

  PENDING = "PENDING"
  STARTED = "STARTED"
  SUCCESS = "SUCCESS"
  FAILURE = "FAILURE"
  RETRY = "RETRY"
  REVOKED = "REVOKED"
  PROGRESS = "PROGRESS"


class TaskStatus(BaseModel):
  """Task status response model."""

  task_id: str
  state: TaskState
  progress: Optional[float] = None
  result: Optional[dict[str, Any]] = None
  error: Optional[str] = None


def get_task_status(task_id: str) -> TaskStatus:
  """Get the status of a Celery task by ID."""
  from celery.result import AsyncResult

  result = AsyncResult(task_id, app=celery_app)

  status = TaskStatus(
    task_id=task_id,
    state=TaskState(result.state) if result.state in TaskState.__members__ else TaskState.PENDING,
  )

  if result.state == "SUCCESS":
    status.result = result.result if isinstance(result.result, dict) else {"value": result.result}
    status.progress = 1.0
  elif result.state == "FAILURE":
    status.error = str(result.result) if result.result else "Unknown error"
    status.progress = 0.0
  elif result.state == "STARTED":
    status.progress = 0.1
  elif result.state == "PROGRESS":
    # Custom state for progress updates
    info = result.info or {}
    status.progress = info.get("progress", 0.5)
  elif result.state == "RETRY":
    status.progress = 0.0

  return status


def revoke_task(task_id: str, terminate: bool = False) -> bool:
  """Revoke/cancel a pending or running task.

  Args:
      task_id: The task ID to revoke
      terminate: If True, terminate the task even if it's running

  Returns:
      True if revocation was sent (doesn't guarantee task was stopped)
  """
  try:
    celery_app.control.revoke(task_id, terminate=terminate)
    logger.info("Task revoked", task_id=task_id, terminate=terminate)
    return True
  except Exception as e:
    logger.error("Failed to revoke task", task_id=task_id, error=str(e))
    return False


def get_active_tasks() -> dict[str, list[dict[str, Any]]]:
  """Get all active tasks across all workers."""
  try:
    inspector = celery_app.control.inspect()
    active = inspector.active() or {}
    return active
  except Exception as e:
    logger.error("Failed to get active tasks", error=str(e))
    return {}


def get_worker_stats() -> dict[str, Any]:
  """Get statistics about Celery workers."""
  try:
    inspector = celery_app.control.inspect()
    stats = inspector.stats() or {}
    return stats
  except Exception as e:
    logger.error("Failed to get worker stats", error=str(e))
    return {}


def get_dead_letter_tasks(limit: int = 100) -> list[dict[str, Any]]:
  """Get tasks from the dead letter queue.

  Returns a list of task info dicts from the DLQ.
  """
  import redis

  from app.core.config import settings

  try:
    r = redis.Redis(
      host=settings.REDIS_HOST,
      port=settings.REDIS_PORT,
      db=settings.REDIS_DB,
    )

    # Get messages from dead_letter queue
    # Note: This is a simplified implementation - in production you might
    # want to use Celery's inspect or a more robust approach
    tasks = []
    queue_key = "dead_letter"

    # Try to peek at messages without consuming them
    queue_length = r.llen(queue_key)
    if queue_length > 0:
      # Get up to 'limit' messages
      messages = r.lrange(queue_key, 0, min(limit - 1, queue_length - 1))
      for i, msg in enumerate(messages):
        try:
          import json

          task_data = json.loads(msg)
          tasks.append(
            {
              "index": i,
              "task_id": task_data.get("headers", {}).get("id", "unknown"),
              "task_name": task_data.get("headers", {}).get("task", "unknown"),
              "args": task_data.get("body", {}).get("args", []),
              "kwargs": task_data.get("body", {}).get("kwargs", {}),
              "retries": task_data.get("headers", {}).get("retries", 0),
            }
          )
        except Exception:
          tasks.append({"index": i, "raw": str(msg)[:200]})

    return tasks
  except Exception as e:
    logger.error("Failed to get dead letter tasks", error=str(e))
    return []


def requeue_dead_letter_task(task_id: str, target_queue: str = "processing") -> bool:
  """Requeue a task from the dead letter queue to a target queue.

  Note: This is a simplified implementation. In production, you'd want
  to properly deserialize and re-dispatch the task.
  """
  import redis

  from app.core.config import settings

  try:
    r = redis.Redis(
      host=settings.REDIS_HOST,
      port=settings.REDIS_PORT,
      db=settings.REDIS_DB,
    )

    # Find and move the task from dead_letter to target queue
    queue_key = "dead_letter"
    queue_length = r.llen(queue_key)

    for i in range(queue_length):
      msg = r.lindex(queue_key, i)
      if msg:
        try:
          import json

          task_data = json.loads(msg)
          if task_data.get("headers", {}).get("id") == task_id:
            # Remove from DLQ and push to target queue
            r.lrem(queue_key, 1, msg)
            r.rpush(target_queue, msg)
            logger.info(
              "Requeued task from DLQ",
              task_id=task_id,
              target_queue=target_queue,
            )
            return True
        except Exception:
          continue

    return False
  except Exception as e:
    logger.error("Failed to requeue task", task_id=task_id, error=str(e))
    return False
