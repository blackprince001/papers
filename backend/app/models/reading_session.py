from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base


class ReadingSession(Base):
  __tablename__ = "reading_sessions"

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True
  )
  start_time = Column(DateTime(timezone=True), nullable=False)
  end_time = Column(DateTime(timezone=True), nullable=True)
  duration_minutes = Column(Integer, nullable=False, default=0)
  pages_viewed = Column(Integer, nullable=False, default=0)

  paper = relationship("Paper", back_populates="reading_sessions")
