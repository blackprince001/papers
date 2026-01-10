from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


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
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True
