from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

ExplanationAction = Literal["explain", "why", "define"]
ExplanationVisibility = Literal["private", "paper"]
ExplanationStatus = Literal["queued", "generating", "ready", "failed", "expired"]


class AnnotationBase(BaseModel):
  content: str
  type: Optional[str] = "annotation"  # 'annotation' or 'note'
  highlighted_text: Optional[str] = None
  selection_data: Optional[Dict[str, Any]] = None
  note_scope: Optional[str] = None  # For notes: 'page' or 'document'
  coordinate_data: Optional[Dict[str, Any]] = {}


class AnnotationCreate(AnnotationBase):
  paper_id: int


class AnnotationUpdate(BaseModel):
  content: Optional[str] = None
  type: Optional[str] = None
  highlighted_text: Optional[str] = None
  selection_data: Optional[Dict[str, Any]] = None
  note_scope: Optional[str] = None
  coordinate_data: Optional[Dict[str, Any]] = None


class Annotation(AnnotationBase):
  id: int
  paper_id: int
  auto_highlighted: bool = False
  highlight_type: Optional[str] = None
  user_display_name: Optional[str] = None
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True


class GroundingRect(BaseModel):
  """A normalized rectangle in the unrotated page coordinate space."""

  left: float = Field(ge=0, le=1)
  top: float = Field(ge=0, le=1)
  width: float = Field(ge=0, le=1)
  height: float = Field(ge=0, le=1)

  @model_validator(mode="after")
  def stays_inside_page(self) -> "GroundingRect":
    if self.left + self.width > 1 or self.top + self.height > 1:
      raise ValueError("grounding rectangle must stay within the page")
    return self


class SemanticAnchor(BaseModel):
  """Stable quote-plus-geometry snapshot used to ground a reader answer."""

  version: Literal[1] = 1
  page: int = Field(ge=1)
  quoted_text: str = Field(min_length=1, max_length=4000)
  rects: List[GroundingRect] = Field(default_factory=list, max_length=128)
  prefix: Optional[str] = Field(default=None, max_length=256)
  suffix: Optional[str] = Field(default=None, max_length=256)
  # Updated when the paper's durable content changes. It is intentionally a
  # revision token, not a foreign key to an as-yet undefined passage model.
  document_revision: Optional[str] = Field(default=None, max_length=128)

  @model_validator(mode="after")
  def has_non_blank_quote(self) -> "SemanticAnchor":
    if not self.quoted_text.strip():
      raise ValueError("quoted_text must not be blank")
    return self


class AnnotationExplanation(BaseModel):
  """Public cache record; owner identity is enforced server-side, not exposed."""

  model_config = ConfigDict(from_attributes=True)

  id: int
  annotation_id: int
  action: ExplanationAction
  status: ExplanationStatus
  visibility: ExplanationVisibility
  generation: int
  anchor: SemanticAnchor
  input_hash: str
  prompt_version: str
  provider: Optional[str] = None
  model: Optional[str] = None
  answer: Optional[str] = None
  evidence: List[Dict[str, Any]] = Field(default_factory=list)
  error_code: Optional[str] = None
  retention_until: datetime
  created_at: datetime
  updated_at: datetime
