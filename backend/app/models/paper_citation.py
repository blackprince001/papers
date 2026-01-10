from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class PaperCitation(Base):
  __tablename__ = "paper_citations"

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True
  )
  cited_paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=True
  )
  citation_context = Column(Text, nullable=True)
  external_paper_title = Column(String, nullable=True)
  external_paper_doi = Column(String, nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  paper = relationship("Paper", foreign_keys=[paper_id])
  cited_paper = relationship("Paper", foreign_keys=[cited_paper_id])
