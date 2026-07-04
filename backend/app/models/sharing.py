from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base

share_permission_enum = Enum(
  "viewer",
  "editor",
  name="sharepermission",
)


class UserPaperState(Base):
  __tablename__ = "user_paper_state"

  user_id = Column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
  )
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True
  )
  reading_status = Column(
    Enum("not_started", "in_progress", "read", "archived", name="readingstatus"),
    nullable=False,
    default="not_started",
    server_default="not_started",
  )
  priority = Column(
    Enum("low", "medium", "high", "critical", name="prioritylevel"),
    nullable=False,
    default="low",
    server_default="low",
  )
  reading_time_minutes = Column(Integer, nullable=False, default=0, server_default="0")
  last_read_page = Column(Integer, nullable=True)
  last_read_at = Column(DateTime(timezone=True), nullable=True)
  # Touched every time the user opens the paper — powers server-side recents.
  last_opened_at = Column(DateTime(timezone=True), nullable=True, index=True)
  status_updated_at = Column(DateTime(timezone=True), nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  user = relationship("User", back_populates="paper_states")
  paper = relationship("Paper", back_populates="user_states")


class PaperShare(Base):
  __tablename__ = "paper_shares"
  __table_args__ = (
    UniqueConstraint(
      "paper_id", "recipient_id", name="uq_paper_shares_paper_recipient"
    ),
  )

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False
  )
  recipient_id = Column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
  )
  shared_by_id = Column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
  )
  permission = Column(
    share_permission_enum,
    nullable=False,
    default="viewer",
    server_default="viewer",
  )
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  paper = relationship("Paper", back_populates="shares")
  recipient = relationship(
    "User", foreign_keys=[recipient_id], back_populates="paper_shares"
  )
  shared_by = relationship(
    "User", foreign_keys=[shared_by_id], back_populates="shared_papers"
  )


class GroupShare(Base):
  __tablename__ = "group_shares"
  __table_args__ = (
    UniqueConstraint(
      "group_id", "recipient_id", name="uq_group_shares_group_recipient"
    ),
  )

  id = Column(Integer, primary_key=True, index=True)
  group_id = Column(
    Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
  )
  recipient_id = Column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
  )
  shared_by_id = Column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
  )
  permission = Column(
    share_permission_enum,
    nullable=False,
    default="viewer",
    server_default="viewer",
  )
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  group = relationship("Group", back_populates="shares")
  recipient = relationship(
    "User", foreign_keys=[recipient_id], back_populates="group_shares"
  )
  shared_by = relationship(
    "User", foreign_keys=[shared_by_id], back_populates="shared_groups"
  )
