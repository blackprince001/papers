from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, HttpUrl

from app.schemas.tag import Tag


class PaperMetadata(BaseModel):
  """Structured metadata extracted from PDF content."""

  title: Optional[str] = None
  authors: List[str] = []
  publication_date: Optional[str] = None
  journal: Optional[str] = None
  volume: Optional[str] = None
  issue: Optional[str] = None
  pages: Optional[str] = None
  doi: Optional[str] = None
  abstract: Optional[str] = None
  keywords: Optional[List[str]] = None


class PaperBase(BaseModel):
  title: str
  doi: Optional[str] = None
  metadata_json: Optional[Dict[str, Any]] = {}
  volume: Optional[str] = None
  issue: Optional[str] = None
  pages: Optional[str] = None
  isbn: Optional[str] = None
  issn: Optional[str] = None


class PaperCreate(PaperBase):
  url: HttpUrl  # Original URL (Arxiv/Nature etc)
  group_ids: Optional[List[int]] = None


class PaperUpdate(BaseModel):
  title: Optional[str] = None
  doi: Optional[str] = None
  metadata_json: Optional[Dict[str, Any]] = None
  group_ids: Optional[List[int]] = None
  tag_ids: Optional[List[int]] = None
  volume: Optional[str] = None
  issue: Optional[str] = None
  pages: Optional[str] = None
  isbn: Optional[str] = None
  issn: Optional[str] = None
  reading_status: Optional[str] = None
  priority: Optional[str] = None


class Paper(PaperBase):
  id: int
  url: Optional[str] = None
  file_path: Optional[str] = None
  content_text: Optional[str] = None
  volume: Optional[str] = None
  issue: Optional[str] = None
  pages: Optional[str] = None
  isbn: Optional[str] = None
  issn: Optional[str] = None
  viewed_count: int = 0
  reading_status: str = "not_started"
  reading_time_minutes: int = 0
  last_read_page: Optional[int] = None
  priority: str = "low"
  status_updated_at: Optional[datetime] = None
  last_read_at: Optional[datetime] = None
  ai_summary: Optional[str] = None
  summary_generated_at: Optional[datetime] = None
  key_findings: Optional[Dict[str, Any]] = None
  findings_extracted_at: Optional[datetime] = None
  reading_guide: Optional[Dict[str, Any]] = None
  guide_generated_at: Optional[datetime] = None
  tags: List[Tag] = []
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True


class PaperListResponse(BaseModel):
  papers: List[Paper]
  total: int
  page: int
  page_size: int


class PaperUploadResponse(BaseModel):
  paper_ids: List[int]
  errors: List[Dict[str, Any]] = []
