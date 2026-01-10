from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

from app.models.base import Base

# Association table for many-to-many relationship between papers and tags
paper_tag_association = Table(
  "paper_tags",
  Base.metadata,
  Column(
    "paper_id", Integer, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True
  ),
  Column(
    "tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
  ),
)


class Tag(Base):
  __tablename__ = "tags"

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, nullable=False, unique=True, index=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  papers = relationship("Paper", secondary=paper_tag_association, back_populates="tags")
