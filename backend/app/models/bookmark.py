from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class Bookmark(Base):
  __tablename__ = "bookmarks"

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True
  )
  page_number = Column(Integer, nullable=False)
  note = Column(Text, nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  paper = relationship("Paper", back_populates="bookmarks")
