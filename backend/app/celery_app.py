from celery import Celery
from kombu import Exchange, Queue

from app.core.config import settings

celery_app = Celery(
  "research_engine",
  broker=settings.CELERY_BROKER_URL,
  backend=settings.CELERY_RESULT_BACKEND,
)

# Define exchanges
default_exchange = Exchange("default", type="direct")
ai_exchange = Exchange("ai", type="direct")
dead_letter_exchange = Exchange("dead_letter", type="direct")

# Celery configuration
celery_app.conf.update(
  # Task settings
  task_serializer="json",
  accept_content=["json"],
  result_serializer="json",
  timezone="UTC",
  enable_utc=True,
  # Result backend settings (Issue #10: Increased expiry to 24 hours)
  result_expires=86400,  # Results expire after 24 hours (was 1 hour)
  result_extended=True,  # Store additional task metadata
  # Task execution settings
  task_acks_late=True,  # Acknowledge tasks after completion (safer)
  task_reject_on_worker_lost=True,  # Reject tasks if worker dies
  worker_prefetch_multiplier=1,  # One task at a time per worker (for AI tasks)
  # Task time limits (Issue #8: Prevent hanging tasks)
  task_soft_time_limit=300,  # 5 minutes soft limit (raises SoftTimeLimitExceeded)
  task_time_limit=360,  # 6 minutes hard limit (kills task)
  # Queue configuration with Dead Letter Queue (Issue #12)
  task_default_queue="processing",
  task_queues=(
    # Main processing queue with DLQ routing
    Queue(
      "processing",
      exchange=default_exchange,
      routing_key="processing",
      queue_arguments={
        "x-dead-letter-exchange": "dead_letter",
        "x-dead-letter-routing-key": "dead_letter",
      },
    ),
    # AI queue with DLQ routing
    Queue(
      "ai",
      exchange=ai_exchange,
      routing_key="ai",
      queue_arguments={
        "x-dead-letter-exchange": "dead_letter",
        "x-dead-letter-routing-key": "dead_letter",
      },
    ),
    # Dead letter queue for failed tasks after max retries
    Queue(
      "dead_letter",
      exchange=dead_letter_exchange,
      routing_key="dead_letter",
    ),
  ),
  task_routes={
    "app.tasks.ai_tasks.*": {"queue": "ai"},
    "app.tasks.search_tasks.*": {"queue": "ai"},
    "app.tasks.paper_processing.*": {"queue": "processing"},
  },
  # Rate limiting for AI queue
  task_annotations={
    "app.tasks.ai_tasks.*": {"rate_limit": "10/m"},
    "app.tasks.search_tasks.*": {"rate_limit": "10/m"},
  },
  # Retry policy defaults
  task_default_retry_delay=60,  # 1 minute default retry delay
  task_max_retries=3,
)

# Auto-discover tasks from the tasks module
celery_app.autodiscover_tasks(["app.tasks"])
