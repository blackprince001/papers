from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
  JSON,
  Column,
  DateTime,
  Enum,
  ForeignKey,
  Integer,
  String,
  Table,
  Text,
)
from sqlalchemy.orm import relationship

from app.models.base import Base

paper_group_association = Table(
  "paper_groups",
  Base.metadata,
  Column("paper_id", Integer, ForeignKey("papers.id"), primary_key=True),
  Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True),
)


class Paper(Base):
  __tablename__ = "papers"

  id = Column(Integer, primary_key=True, index=True)
  title = Column(String, nullable=False, index=True)
  doi = Column(String, unique=True, index=True, nullable=True)
  url = Column(String, nullable=True)
  file_path = Column(String, nullable=True)
  vector_id = Column(String, nullable=True)
  embedding = Column(Vector(1536), nullable=True)
  metadata_json = Column(JSON, default=dict)
  content_text = Column(Text, nullable=True)
  volume = Column(String, nullable=True)
  issue = Column(String, nullable=True)
  pages = Column(String, nullable=True)
  isbn = Column(String, nullable=True)
  issn = Column(String, nullable=True)
  viewed_count = Column(Integer, default=0, nullable=False)
  reading_status = Column(
    Enum("not_started", "in_progress", "read", "archived", name="readingstatus"),
    nullable=False,
    default="not_started",
    server_default="not_started",
  )
  reading_time_minutes = Column(Integer, default=0, nullable=False, server_default="0")
  last_read_page = Column(Integer, nullable=True)
  priority = Column(
    Enum("low", "medium", "high", "critical", name="prioritylevel"),
    nullable=False,
    default="low",
    server_default="low",
  )
  status_updated_at = Column(DateTime(timezone=True), nullable=True)
  last_read_at = Column(DateTime(timezone=True), nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  annotations = relationship(
    "Annotation", back_populates="paper", cascade="all, delete-orphan"
  )
  groups = relationship(
    "Group", secondary=paper_group_association, back_populates="papers"
  )
  tags = relationship("Tag", secondary="paper_tags", back_populates="papers")
  reading_sessions = relationship(
    "ReadingSession", back_populates="paper", cascade="all, delete-orphan"
  )
  bookmarks = relationship(
    "Bookmark", back_populates="paper", cascade="all, delete-orphan"
  )
  merged_from_paper_id = Column(Integer, ForeignKey("papers.id"), nullable=True)
  is_duplicate_of = Column(Integer, ForeignKey("papers.id"), nullable=True)
  ai_summary = Column(Text, nullable=True)
  summary_generated_at = Column(DateTime(timezone=True), nullable=True)
  key_findings = Column(JSON, nullable=True)
  findings_extracted_at = Column(DateTime(timezone=True), nullable=True)
  reading_guide = Column(JSON, nullable=True)
  guide_generated_at = Column(DateTime(timezone=True), nullable=True)
