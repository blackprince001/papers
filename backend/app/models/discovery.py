from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
  JSON,
  Boolean,
  Column,
  DateTime,
  Float,
  ForeignKey,
  Integer,
  String,
  Table,
  Text,
  UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.config import settings
from app.models.base import Base

# Junction table for discovered papers and topics
discovered_paper_topics = Table(
  "discovered_paper_topics",
  Base.metadata,
  Column(
    "discovered_paper_id",
    Integer,
    ForeignKey("discovered_papers.id", ondelete="CASCADE"),
    primary_key=True,
  ),
  Column(
    "topic_id",
    Integer,
    ForeignKey("research_topics.id", ondelete="CASCADE"),
    primary_key=True,
  ),
  Column("relevance_score", Float, nullable=True),
)


# Junction table for sessions and discovered papers
discovery_session_papers = Table(
  "discovery_session_papers",
  Base.metadata,
  Column(
    "session_id",
    Integer,
    ForeignKey("discovery_sessions.id", ondelete="CASCADE"),
    primary_key=True,
  ),
  Column(
    "discovered_paper_id",
    Integer,
    ForeignKey("discovered_papers.id", ondelete="CASCADE"),
    primary_key=True,
  ),
  Column("relevance_score", Float, nullable=True),
  Column("added_to_library", Boolean, default=False),
  Column(
    "library_paper_id",
    Integer,
    ForeignKey("papers.id", ondelete="SET NULL"),
    nullable=True,
  ),
)


class DiscoveredPaper(Base):
  """Cached external paper from discovery sources."""

  __tablename__ = "discovered_papers"

  id = Column(Integer, primary_key=True, index=True)
  source = Column(
    String, nullable=False, index=True
  )  # 'arxiv', 'semantic_scholar', etc.
  external_id = Column(String, nullable=False)  # Source-specific ID
  title = Column(String, nullable=False)
  authors = Column(JSON, default=list)
  abstract = Column(Text, nullable=True)
  year = Column(Integer, nullable=True)
  doi = Column(String, nullable=True, index=True)
  arxiv_id = Column(String, nullable=True, index=True)
  url = Column(String, nullable=True)
  pdf_url = Column(String, nullable=True)
  citation_count = Column(Integer, nullable=True)
  embedding = Column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)
  metadata_json = Column(JSON, default=dict)
  discovered_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
  )
  last_fetched_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
  )

  # Relationships
  topics = relationship(
    "ResearchTopic",
    secondary=discovered_paper_topics,
    back_populates="papers",
  )
  sessions = relationship(
    "DiscoverySession",
    secondary=discovery_session_papers,
    back_populates="papers",
  )

  __table_args__ = (
    UniqueConstraint(
      "source", "external_id", name="uq_discovered_papers_source_external_id"
    ),
  )


class ResearchTopic(Base):
  """AI-generated topic cluster for organizing discovered papers."""

  __tablename__ = "research_topics"

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, nullable=False)
  description = Column(Text, nullable=True)
  keywords = Column(JSON, default=list)
  embedding = Column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
  )

  # Relationships
  papers = relationship(
    "DiscoveredPaper",
    secondary=discovered_paper_topics,
    back_populates="topics",
  )


class DiscoverySession(Base):
  """Saved discovery search session."""

  __tablename__ = "discovery_sessions"

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, nullable=True)
  query = Column(String, nullable=False)
  sources = Column(JSON, default=list)  # List of source names used
  filters_json = Column(JSON, default=dict)  # Filters applied
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
  )

  # Relationships
  papers = relationship(
    "DiscoveredPaper",
    secondary=discovery_session_papers,
    back_populates="sessions",
  )
