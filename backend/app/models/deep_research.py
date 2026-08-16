from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
  JSON,
  BigInteger,
  Boolean,
  CheckConstraint,
  Column,
  DateTime,
  ForeignKey,
  Integer,
  String,
  Text,
  UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class DeepResearchSession(Base):
  """A long-running, resumable deep-research run.

  Holds ownership and the user-visible report summary. Durable execution
  checkpoints, ordered events, evidence, messages, and broker dispatch records
  live in generation-scoped tables below. ``run_state`` remains a compatibility
  projection while the new lifecycle is rolled out.
  """

  __tablename__ = "deep_research_sessions"

  id = Column(Integer, primary_key=True, index=True)
  user_id = Column(
    Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
  )
  question = Column(Text, nullable=False)
  title = Column(String, nullable=True)
  # running | paused | completed | failed
  status = Column(String, nullable=False, default="queued", server_default="queued", index=True)
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
  lifecycle_version = Column(Integer, nullable=False, default=0, server_default="0")
  current_generation = Column(Integer, nullable=False, default=1, server_default="1")
  last_event_sequence = Column(BigInteger, nullable=False, default=0, server_default="0")
  correlation_id = Column(
    String(128), default=lambda: str(uuid4()), nullable=False, index=True
  )
  cancel_requested = Column(Boolean, nullable=False, default=False, server_default="false")
  idempotency_key = Column(String(255), nullable=True)
  retention_until = Column(DateTime(timezone=True), nullable=True)

  __table_args__ = (
    CheckConstraint(
      "status IN ('queued','planning','searching','reading','synthesizing','verifying','running','paused','completed','failed','cancel_requested','cancelled')",
      name="ck_dr_session_status",
    ),
    CheckConstraint("lifecycle_version >= 0", name="ck_dr_session_version_nonnegative"),
    CheckConstraint("current_generation >= 1", name="ck_dr_session_generation_positive"),
    CheckConstraint("last_event_sequence >= 0", name="ck_dr_session_sequence_nonnegative"),
    UniqueConstraint("user_id", "idempotency_key", name="uq_dr_session_user_idempotency"),
  )

  # Relationships
  user = relationship("User", back_populates="deep_research_sessions")


class DeepResearchGeneration(Base):
  """One resumable execution generation for a research session."""

  __tablename__ = "deep_research_generations"

  id = Column(Integer, primary_key=True, index=True)
  session_id = Column(
    Integer,
    ForeignKey("deep_research_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  generation_number = Column(Integer, nullable=False)
  status = Column(String(32), nullable=False, default="queued", index=True)
  state_version = Column(Integer, nullable=False, default=0, server_default="0")
  last_event_sequence = Column(BigInteger, nullable=False, default=0, server_default="0")
  checkpoint = Column(JSON, nullable=True)
  checkpoint_bytes = Column(Integer, nullable=True)
  worker_task_id = Column(String(255), nullable=True, index=True)
  lease_until = Column(DateTime(timezone=True), nullable=True)
  lease_token = Column(String(128), nullable=True)
  correlation_id = Column(String(128), nullable=False, index=True)
  started_at = Column(DateTime(timezone=True), nullable=True)
  finished_at = Column(DateTime(timezone=True), nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  __table_args__ = (
    UniqueConstraint("session_id", "generation_number", name="uq_dr_generation_number"),
    CheckConstraint("generation_number >= 1", name="ck_dr_generation_positive"),
    CheckConstraint("state_version >= 0", name="ck_dr_generation_version_nonnegative"),
    CheckConstraint("last_event_sequence >= 0", name="ck_dr_generation_sequence_nonnegative"),
  )


class DeepResearchEvent(Base):
  """Durable, ordered event emitted by a generation."""

  __tablename__ = "deep_research_events"

  id = Column(BigInteger, primary_key=True)
  session_id = Column(
    Integer,
    ForeignKey("deep_research_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  generation_id = Column(
    Integer,
    ForeignKey("deep_research_generations.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  sequence = Column(BigInteger, nullable=False)
  event_type = Column(String(64), nullable=False)
  payload = Column(JSON, nullable=False)
  payload_bytes = Column(Integer, nullable=False)
  correlation_id = Column(String(128), nullable=False, index=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  __table_args__ = (
    UniqueConstraint("generation_id", "sequence", name="uq_dr_event_sequence"),
    CheckConstraint("sequence >= 1", name="ck_dr_event_sequence_positive"),
    CheckConstraint("payload_bytes >= 0", name="ck_dr_event_payload_bytes_nonnegative"),
  )


class DeepResearchEvidence(Base):
  """Evidence ledger entry with stable provenance and authorization metadata."""

  __tablename__ = "deep_research_evidence"

  id = Column(Integer, primary_key=True, index=True)
  session_id = Column(
    Integer,
    ForeignKey("deep_research_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  generation_id = Column(
    Integer,
    ForeignKey("deep_research_generations.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  provenance_id = Column(String(255), nullable=False)
  source_type = Column(String(32), nullable=False)
  external_id = Column(String(512), nullable=True)
  title = Column(String(1024), nullable=False)
  url = Column(String(2048), nullable=True)
  metadata_json = Column(JSON, nullable=True)
  content_hash = Column(String(128), nullable=True)
  authorization_status = Column(String(32), nullable=False, default="verified")
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  __table_args__ = (
    UniqueConstraint("generation_id", "provenance_id", name="uq_dr_evidence_provenance"),
  )


class DeepResearchMessage(Base):
  """Bounded durable message/input item associated with a generation."""

  __tablename__ = "deep_research_messages"

  id = Column(BigInteger, primary_key=True)
  session_id = Column(
    Integer,
    ForeignKey("deep_research_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  generation_id = Column(
    Integer,
    ForeignKey("deep_research_generations.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  sequence = Column(BigInteger, nullable=False)
  role = Column(String(32), nullable=False)
  content = Column(Text, nullable=False)
  content_bytes = Column(Integer, nullable=False)
  payload = Column(JSON, nullable=True)
  correlation_id = Column(String(128), nullable=False, index=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  __table_args__ = (
    UniqueConstraint("generation_id", "sequence", name="uq_dr_message_sequence"),
    CheckConstraint("sequence >= 1", name="ck_dr_message_sequence_positive"),
    CheckConstraint("content_bytes >= 0", name="ck_dr_message_content_bytes_nonnegative"),
  )


class DeepResearchOutbox(Base):
  """Transactional dispatch record for broker delivery and reconciliation."""

  __tablename__ = "deep_research_outbox"

  id = Column(BigInteger, primary_key=True)
  session_id = Column(
    Integer,
    ForeignKey("deep_research_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  generation_id = Column(
    Integer,
    ForeignKey("deep_research_generations.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  idempotency_key = Column(String(255), nullable=False, unique=True)
  event_type = Column(String(64), nullable=False)
  payload = Column(JSON, nullable=False)
  payload_bytes = Column(Integer, nullable=False)
  attempts = Column(Integer, nullable=False, default=0, server_default="0")
  available_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  published_at = Column(DateTime(timezone=True), nullable=True)
  lease_until = Column(DateTime(timezone=True), nullable=True)
  last_error = Column(Text, nullable=True)
  correlation_id = Column(String(128), nullable=False, index=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  __table_args__ = (
    CheckConstraint("attempts >= 0", name="ck_dr_outbox_attempts_nonnegative"),
    CheckConstraint("payload_bytes >= 0", name="ck_dr_outbox_payload_bytes_nonnegative"),
  )
