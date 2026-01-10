from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel


class SummaryRequest(BaseModel):
  pass  # Can add parameters later


class SummaryResponse(BaseModel):
  summary: str
  generated_at: Optional[datetime] = None


class FindingsResponse(BaseModel):
  findings: Dict  # JSON structure with key_findings, conclusions, etc.


class ReadingGuideResponse(BaseModel):
  guide: Dict  # JSON structure with pre_reading, during_reading, post_reading


class HighlightRequest(BaseModel):
  pass  # Can add parameters later
