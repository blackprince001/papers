from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class TagBase(BaseModel):
  name: str


class TagCreate(TagBase):
  pass


class TagUpdate(BaseModel):
  name: Optional[str] = None


class Tag(TagBase):
  id: int
  created_at: datetime
  updated_at: datetime

  class Config:
    from_attributes = True


class TagListResponse(BaseModel):
  tags: List[Tag]
  total: int
