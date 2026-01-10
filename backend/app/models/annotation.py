from datetime import datetime, timezone

from sqlalchemy import (
  JSON,
  Boolean,
  Column,
  DateTime,
  Enum,
  ForeignKey,
  Integer,
  String,
  Text,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Annotation(Base):
  __tablename__ = "annotations"

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True
  )
  content = Column(Text, nullable=False)
  type = Column(String, default="annotation", nullable=False)
  highlighted_text = Column(Text, nullable=True)
  selection_data = Column(JSON, nullable=True)
  note_scope = Column(String, nullable=True)
  coordinate_data = Column(JSON, default=dict)
  auto_highlighted = Column(Boolean, default=False, nullable=False)
  highlight_type = Column(
    Enum("method", "result", "conclusion", "key_contribution", name="highlighttype"),
    nullable=True,
  )
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  paper = relationship("Paper", back_populates="annotations")
