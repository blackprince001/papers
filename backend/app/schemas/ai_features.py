from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.annotation import ExplanationVisibility, GroundingRect


class SummaryRequest(BaseModel):
  pass


class SummaryResponse(BaseModel):
  summary: Optional[str] = None
  generated_at: Optional[datetime] = None
  status: str = "completed"  # pending, processing, completed, failed


class FindingsResponse(BaseModel):
  findings: Optional[Dict] = None
  generated_at: Optional[datetime] = None
  status: str = "completed"


class ReadingGuideResponse(BaseModel):
  guide: Optional[Dict] = None
  generated_at: Optional[datetime] = None
  status: str = "completed"


class HighlightRequest(BaseModel):
  pass


class SelectionRect(GroundingRect):
  """One highlight rect, normalized 0-1 against the page dimensions."""


class AIActionRequest(BaseModel):
  """Selection AI action: answer is saved as an anchored annotation."""

  action: Literal["explain", "why", "define"]
  selection_text: str = Field(min_length=1, max_length=4000)
  page: int = Field(ge=1)
  rects: List[SelectionRect] = Field(default_factory=list, max_length=128)
  visibility: ExplanationVisibility = "private"
  regenerate: bool = False
  context: Optional[Dict[str, Any]] = None

  @model_validator(mode="after")
  def has_non_blank_selection(self) -> "AIActionRequest":
    if not self.selection_text.strip():
      raise ValueError("selection_text must not be blank")
    return self
