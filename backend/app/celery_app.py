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
discovery_exchange = Exchange("discovery", type="direct")
research_exchange = Exchange("research", type="direct")
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
  # Redis does not implement AMQP queue arguments. Keep the explicit
  # dead_letter queue for application-level routing; do not claim broker-level
  # dead-lettering here.
  task_default_queue="processing",
  task_queues=(
    # Main processing queue
    Queue(
      "processing",
      exchange=default_exchange,
      routing_key="processing",
    ),
    # AI queue
    Queue(
      "ai",
      exchange=ai_exchange,
      routing_key="ai",
    ),
    # Discovery queue — external API calls + AI enhancements for paper discovery
    Queue(
      "discovery",
      exchange=discovery_exchange,
      routing_key="discovery",
    ),
    # Research queue — long-running, resumable deep-research runs, isolated so
    # they never starve fast AI features on the `ai` queue.
    Queue(
      "research",
      exchange=research_exchange,
      routing_key="research",
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
    "app.tasks.paper_processing.*": {"queue": "processing"},
    "app.tasks.discovery_tasks.*": {"queue": "discovery"},
    "app.tasks.deep_research_tasks.*": {"queue": "research"},
    "research.run_deep_research": {"queue": "research"},
    "research.dispatch_outbox": {"queue": "processing"},
  },
  # Retry policy defaults
  task_default_retry_delay=60,  # 1 minute default retry delay
  task_max_retries=3,
  # Periodic schedule (Celery beat). The retry sweep is the "retry pool":
  # it re-dispatches AI steps (summary, findings, reading guide, embedding,
  # layout) for papers still missing them, recovering steps that failed or
  # were skipped at ingest time.
  beat_schedule={
    "retry-incomplete-ai": {
      "task": "processing.retry_incomplete_ai",
      "schedule": 600.0,  # every 10 minutes
      "options": {"queue": "processing"},
    },
    "dispatch-research-outbox": {
      "task": "research.dispatch_outbox",
      "schedule": 30.0,
      "options": {"queue": "processing"},
    },
  },
)

# Auto-discover tasks from the tasks module
celery_app.autodiscover_tasks(["app.tasks"])
