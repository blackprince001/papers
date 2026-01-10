from pydantic import BaseModel

from app.schemas.paper import Paper


class DuplicateMatch(BaseModel):
  paper: Paper
  confidence_score: float
  detection_method: str  # doi, title, content, author_title


class MergeRequest(BaseModel):
  primary_paper_id: int
  duplicate_paper_id: int


class MergePreview(BaseModel):
  primary_paper: Paper
  duplicate_paper: Paper
  annotations_to_merge: int
  tags_to_add: int
  groups_to_add: int
