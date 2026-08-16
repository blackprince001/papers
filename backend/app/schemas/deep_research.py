from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.core.config import settings


class DeepResearchSessionCreate(BaseModel):
  """Request to start a deep-research run."""

  question: str = Field(min_length=1, max_length=settings.DEEP_RESEARCH_MAX_QUESTION_LENGTH)


class CitedSource(BaseModel):
  """A source surfaced during a research run.

  Rich metadata is populated when the source came from a discovery tool
  (structured paper); report-link fallbacks carry only title + url.
  """

  title: str
  url: Optional[str] = None
  source: Optional[str] = None
  external_id: Optional[str] = None
  # "academic" (arXiv/Semantic Scholar/Scholar) | "web" (OpenAlex)
  type: Optional[str] = None
  authors: Optional[Any] = None
  year: Optional[int] = None
  citation_count: Optional[int] = None
  pdf_url: Optional[str] = None


class DeepResearchSession(BaseModel):
  """Deep-research session summary (list view)."""

  id: int
  question: str
  title: Optional[str] = None
  status: str
  last_error_code: Optional[str] = None
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True


class DeepResearchSessionDetail(DeepResearchSession):
  """Deep-research session with the report and cited sources.

  ``run_state`` (the internal resume checkpoint) is intentionally omitted — it
  is never sent to the client.
  """

  report: Optional[str] = None
  cited_sources: Optional[List[CitedSource]] = None
