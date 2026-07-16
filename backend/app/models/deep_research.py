from datetime import datetime, timezone

from sqlalchemy import (
  JSON,
  Column,
  DateTime,
  ForeignKey,
  Integer,
  String,
  Text,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeepResearchSession(Base):
  """A long-running, resumable deep-research run.

  Holds the research question, the streamed markdown report, and the ordered
  list of cited sources. ``run_state`` is an internal resume checkpoint — the
  agent's accumulated input-item list (``to_input_list()``) — that lets an
  interrupted run continue without repeating work it already did. It is never
  serialized to the client.
  """

  __tablename__ = "deep_research_sessions"

  id = Column(Integer, primary_key=True, index=True)
  user_id = Column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
  )
  question = Column(Text, nullable=False)
  title = Column(String, nullable=True)
  # running | paused | completed | failed
  status = Column(String, nullable=False, default="running", index=True)
  report = Column(Text, nullable=True)
  # Ordered list of [{title, url, source, external_id}] surfaced during the run.
  cited_sources = Column(JSON, nullable=True)
  # Internal resume checkpoint (agent to_input_list()); not exposed to clients.
  run_state = Column(JSON, nullable=True)
  last_error_code = Column(String, nullable=True)
  attempt_count = Column(Integer, nullable=False, default=0)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
  )

  # Relationships
  user = relationship("User", back_populates="deep_research_sessions")
