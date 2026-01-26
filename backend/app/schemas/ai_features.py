from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel


class SummaryRequest(BaseModel):
  pass


class SummaryResponse(BaseModel):
  summary: Optional[str] = None
  generated_at: Optional[datetime] = None
  status: str = "completed"  # pending, processing, completed, failed


class FindingsResponse(BaseModel):
  findings: Optional[Dict] = None
  status: str = "completed"


class ReadingGuideResponse(BaseModel):
  guide: Optional[Dict] = None
  status: str = "completed"


class HighlightRequest(BaseModel):
  pass
