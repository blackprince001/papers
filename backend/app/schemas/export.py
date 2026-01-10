from typing import List

from pydantic import BaseModel


class ExportRequest(BaseModel):
  paper_ids: List[int]
  format: str  # csv, json, ris, endnote
  include_annotations: bool = False


class CitationExportRequest(BaseModel):
  paper_ids: List[int]
  format: str  # apa, mla, bibtex
