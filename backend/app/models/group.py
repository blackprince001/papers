from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base


class Group(Base):
  __tablename__ = "groups"

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, nullable=False, index=True)
  parent_id = Column(
    Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=True, index=True
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

  # Self-referential relationships
  parent = relationship("Group", remote_side=[id], back_populates="children")
  children = relationship(
    "Group", back_populates="parent", cascade="all, delete-orphan"
  )

  papers = relationship("Paper", secondary="paper_groups", back_populates="groups")

  # Note: Unique constraints are handled via partial indexes in migrations
  # to correctly handle NULL parent_id values
