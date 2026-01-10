from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base


class DuplicateDetectionLog(Base):
  __tablename__ = "duplicate_detection_log"

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
  )
  duplicate_paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
  )
  confidence_score = Column(Float, nullable=False)
  detection_method = Column(String, nullable=False)
  detected_at = Column(
    DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
  )
  merged = Column(Boolean, nullable=False, default=False)
  merged_at = Column(DateTime(timezone=True), nullable=True)

  paper = relationship("Paper", foreign_keys=[paper_id])
  duplicate_paper = relationship("Paper", foreign_keys=[duplicate_paper_id])
