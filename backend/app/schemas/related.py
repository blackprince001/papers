from typing import List, Optional

from pydantic import BaseModel

from app.schemas.paper import Paper as PaperSchema


class RelatedPaperExternal(BaseModel):
  title: Optional[str] = None
  doi: Optional[str] = None
  authors: List[str] = []
  url: Optional[str] = None
  year: Optional[int] = None


class RelatedPapersResponse(BaseModel):
  cited_by: List[RelatedPaperExternal] = []
  cited_here: List[RelatedPaperExternal] = []
  related_library: List[PaperSchema] = []
  related_internet: List[RelatedPaperExternal] = []
