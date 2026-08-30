from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

from app.core.config import settings


class DeepResearchSessionCreate(BaseModel):
  """Request to start a deep-research run."""

  question: str = Field(min_length=1, max_length=settings.DEEP_RESEARCH_MAX_QUESTION_LENGTH)
  provider_id: Optional[int] = Field(default=None, gt=0)


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
  current_generation: int = 1
  lifecycle_version: int = 0
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True


class DeepResearchGenerationSummary(BaseModel):
  """Safe progress metadata for the current execution generation.

  Provider credentials and agent checkpoints deliberately do not cross this
  boundary. The values are a snapshot, so clients can render recovery and
  progress without treating a dropped stream as a failed run.
  """

  id: int
  generation_number: int
  mode: Literal["ask", "research"]
  status: str
  provider_type: Optional[str] = None
  model: Optional[str] = None
  scope: str
  effort: str
  phase: str
  progress: int = Field(ge=0, le=100)
  source_count: int = Field(default=0, ge=0)
  verification_status: Literal[
    "pending", "in_progress", "verified", "insufficient_evidence", "needs_attention"
  ]
  stop_reason: Optional[str] = None
  started_at: Optional[datetime] = None
  finished_at: Optional[datetime] = None


class DeepResearchArchiveResponse(BaseModel):
  """Bounded archive page with an explicit continuation contract."""

  items: List[DeepResearchSession]
  total: int = Field(ge=0)
  limit: int = Field(ge=1, le=100)
  offset: int = Field(ge=0)
  has_more: bool


class DeepResearchSessionDetail(DeepResearchSession):
  """Deep-research session with the report and cited sources.

  Internal execution checkpoints are intentionally omitted — they are never
  sent to the client.
  """

  report: Optional[str] = None
  cited_sources: Optional[List[CitedSource]] = None
  generation: Optional[DeepResearchGenerationSummary] = None


class DeepResearchFollowUpCreate(BaseModel):
  """Explicit conversational mode for a completed research session."""

  mode: Literal["ask", "research"]
  question: str = Field(min_length=1, max_length=settings.DEEP_RESEARCH_MAX_QUESTION_LENGTH)


class DeepResearchMessage(BaseModel):
  """Safe durable conversation turn; internal payloads are never exposed."""

  id: int
  session_id: int
  generation_id: int
  generation_number: int
  role: Literal["user", "assistant"]
  mode: Literal["ask", "research"]
  content: str
  source_ids: List[int] = Field(default_factory=list)
  verification: Optional[str] = None
  created_at: datetime


class DeepResearchFollowUpResponse(BaseModel):
  """Result of an Ask this research or Research further request."""

  mode: Literal["ask", "research"]
  status: str
  generation_number: int
  message: DeepResearchMessage
  assistant_message: Optional[DeepResearchMessage] = None
  session: DeepResearchSession
