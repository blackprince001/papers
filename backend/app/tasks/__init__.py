# Celery tasks module
# Import all tasks to ensure they are registered with Celery

from app.tasks.ai_tasks import (
  extract_findings_task,
  generate_embedding_task,
  generate_reading_guide_task,
  generate_summary_task,
)
from app.tasks.paper_processing import (
  extract_citations_task,
  process_paper_full,
)
from app.tasks.search_tasks import (
  cluster_papers_task,
  explain_relevance_task,
  generate_overview_task,
  understand_query_task,
)

__all__ = [
  "generate_summary_task",
  "extract_findings_task",
  "generate_reading_guide_task",
  "generate_embedding_task",
  "extract_citations_task",
  "process_paper_full",
  "understand_query_task",
  "generate_overview_task",
  "cluster_papers_task",
  "explain_relevance_task",
]
