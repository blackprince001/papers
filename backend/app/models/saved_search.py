from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON

from app.models.base import Base


class SavedSearch(Base):
  __tablename__ = "saved_searches"

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, nullable=False)
  description = Column(Text, nullable=True)
  query_params = Column(JSON, nullable=False)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )
