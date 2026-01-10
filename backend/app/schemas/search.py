from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.paper import Paper


class SearchRequest(BaseModel):
  query: str
  limit: int = 10
  threshold: Optional[float] = None  # Similarity threshold
  # Advanced filters
  date_from: Optional[str] = None
  date_to: Optional[str] = None
  authors: Optional[List[str]] = None
  journal: Optional[str] = None
  tag_ids: Optional[List[int]] = None
  reading_status: Optional[str] = None
  priority: Optional[str] = None
  group_ids: Optional[List[int]] = None
  has_annotations: Optional[bool] = None
  has_notes: Optional[bool] = None
  reading_time_min: Optional[int] = None
  reading_time_max: Optional[int] = None


class SearchResult(BaseModel):
  paper: Paper
  similarity: float  # Cosine similarity score


class SearchResponse(BaseModel):
  results: List[SearchResult]
  query: str
  total: int


class SavedSearchCreate(BaseModel):
  name: str
  description: Optional[str] = None
  query_params: dict


class SavedSearchResponse(BaseModel):
  id: int
  name: str
  description: Optional[str]
  query_params: dict
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True
