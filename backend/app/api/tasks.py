from fastapi import APIRouter, HTTPException

from app.services.task_status import (
  TaskStatus,
  get_active_tasks,
  get_dead_letter_tasks,
  get_task_status,
  get_worker_stats,
  requeue_dead_letter_task,
  revoke_task,
)

router = APIRouter()


@router.get("/{task_id}", response_model=TaskStatus)
async def get_task(task_id: str):
  """Get the status of a background task by ID.

  Returns the current state, progress, and result (if completed) of the task.
  """
  try:
    status = get_task_status(task_id)
    return status
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Failed to get task status: {str(e)}"
    ) from e


@router.delete("/{task_id}")
async def cancel_task(task_id: str, terminate: bool = False):
  """Cancel a pending or running task.

  Args:
      task_id: The task ID to cancel
      terminate: If True, forcefully terminate the task even if running

  Note: Cancellation is best-effort. The task may have already completed.
  """
  success = revoke_task(task_id, terminate=terminate)
  if success:
    return {"message": "Task cancellation requested", "task_id": task_id}
  raise HTTPException(status_code=500, detail="Failed to cancel task")


@router.get("/")
async def list_active_tasks():
  """List all active tasks across all workers.

  Returns a dictionary mapping worker names to their active tasks.
  """
  active = get_active_tasks()
  return {"active_tasks": active}


@router.get("/workers/stats")
async def get_workers_status():
  """Get statistics about Celery workers.

  Returns worker statistics including pool info, broker connection status, etc.
  """
  stats = get_worker_stats()
  if not stats:
    return {
      "status": "no_workers",
      "message": "No Celery workers are currently running",
      "workers": {},
    }
  return {"status": "healthy", "workers": stats}


@router.get("/dead-letter")
async def list_dead_letter_tasks(limit: int = 100):
  """List tasks in the dead letter queue.

  These are tasks that failed after all retries. They can be inspected
  and optionally requeued for another attempt.
  """
  tasks = get_dead_letter_tasks(limit=limit)
  return {"dead_letter_tasks": tasks, "count": len(tasks)}


@router.post("/dead-letter/{task_id}/requeue")
async def requeue_failed_task(task_id: str, queue: str = "processing"):
  """Requeue a task from the dead letter queue.

  Args:
      task_id: The task ID to requeue
      queue: Target queue (processing or ai)
  """
  if queue not in ("processing", "ai"):
    raise HTTPException(status_code=400, detail="Queue must be 'processing' or 'ai'")

  success = requeue_dead_letter_task(task_id, queue)
  if success:
    return {"message": "Task requeued", "task_id": task_id, "queue": queue}
  raise HTTPException(status_code=404, detail="Task not found in dead letter queue")
