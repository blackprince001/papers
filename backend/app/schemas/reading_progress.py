from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReadingStatusUpdate(BaseModel):
  reading_status: str  # not_started, in_progress, read, archived


class PriorityUpdate(BaseModel):
  priority: str  # low, medium, high, critical


class PaperReadingProgress(BaseModel):
  paper_id: int
  reading_status: str
  reading_time_minutes: int
  last_read_page: Optional[int]
  priority: str
  status_updated_at: Optional[datetime]
  last_read_at: Optional[datetime]

  class Config:
    from_attributes = True


class ReadingSessionCreate(BaseModel):
  paper_id: int
  start_time: datetime


class ReadingSessionUpdate(BaseModel):
  end_time: Optional[datetime] = None
  duration_minutes: Optional[int] = None
  pages_viewed: Optional[int] = None
  last_read_page: Optional[int] = None


class ReadingSessionResponse(BaseModel):
  id: int
  paper_id: int
  start_time: datetime
  end_time: Optional[datetime]
  duration_minutes: int
  pages_viewed: int

  class Config:
    from_attributes = True


class BookmarkCreate(BaseModel):
  paper_id: int
  page_number: int
  note: Optional[str] = None


class BookmarkResponse(BaseModel):
  id: int
  paper_id: int
  page_number: int
  note: Optional[str]
  created_at: datetime

  class Config:
    from_attributes = True


class ReadingStatistics(BaseModel):
  papers_read_this_week: int
  papers_read_this_month: int
  papers_read_this_year: int
  total_reading_time_minutes: int
  average_reading_time_per_paper: float
  reading_streak_days: int
  status_distribution: dict[str, int]
  priority_distribution: dict[str, int]


class ReadingStreak(BaseModel):
  current_streak: int
  longest_streak: int
  streak_start_date: Optional[datetime]
  last_reading_date: Optional[datetime]
