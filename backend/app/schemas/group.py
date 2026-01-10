from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, model_validator

from app.schemas.paper import Paper


class GroupBase(BaseModel):
  name: str
  parent_id: Optional[int] = None


class GroupCreate(GroupBase):
  pass


class GroupUpdate(BaseModel):
  name: Optional[str] = None
  parent_id: Optional[int] = None


class Group(GroupBase):
  id: int
  created_at: datetime
  updated_at: datetime
  papers: Optional[List[Paper]] = []
  children: Optional[List["Group"]] = []

  @model_validator(mode="before")
  @classmethod
  def set_children_default(cls, data):
    if isinstance(data, dict) and "children" not in data:
      data["children"] = []
    return data

  class Config:
    from_attributes = True
