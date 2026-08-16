# Celery tasks module
# Import all tasks to ensure they are registered with Celery

from app.tasks.ai_tasks import (
  extract_findings_task,
  generate_embedding_task,
  generate_highlights_task,
  generate_reading_guide_task,
  generate_summary_task,
)
from app.tasks.deep_research_tasks import (
  dispatch_research_outbox,
  run_deep_research_task,
)
from app.tasks.discovery_tasks import (
  ai_enhance_task,
  search_source_task,
)
from app.tasks.paper_processing import (
  backfill_layouts_task,
  extract_citations_task,
  process_paper_full,
  retry_incomplete_ai,
)

__all__ = [
  "generate_summary_task",
  "extract_findings_task",
  "generate_reading_guide_task",
  "generate_highlights_task",
  "generate_embedding_task",
  "extract_citations_task",
  "process_paper_full",
  "backfill_layouts_task",
  "retry_incomplete_ai",
  "search_source_task",
  "ai_enhance_task",
  "dispatch_research_outbox",
  "run_deep_research_task",
]
