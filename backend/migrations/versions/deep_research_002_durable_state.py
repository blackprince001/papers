"""Add checked durable state for deep-research runs.

Revision ID: deep_research_002
Revises: deep_research_001
"""

import sqlalchemy as sa
from alembic import op

revision = "deep_research_002"
down_revision = "deep_research_001"
branch_labels = None
depends_on = None




def upgrade() -> None:
  op.create_table(
    "deep_research_orphans",
    sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column("original_session_id", sa.Integer(), nullable=False),
    sa.Column("reason", sa.String(64), nullable=False),
    sa.Column("payload", sa.JSON(), nullable=True),
    sa.Column("quarantined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
  )
  bind = op.get_bind()
  if bind.dialect.name == "postgresql":
    op.execute(sa.text("""
      INSERT INTO deep_research_orphans (original_session_id, reason, payload)
      SELECT id, 'missing_owner', to_jsonb(deep_research_sessions)
      FROM deep_research_sessions
      WHERE user_id IS NULL
    """))
  else:
    op.execute(sa.text("""
      INSERT INTO deep_research_orphans (original_session_id, reason)
      SELECT id, 'missing_owner' FROM deep_research_sessions WHERE user_id IS NULL
    """))
  op.execute(sa.text("DELETE FROM deep_research_sessions WHERE user_id IS NULL"))

  op.execute(sa.text("ALTER TABLE deep_research_sessions DROP CONSTRAINT IF EXISTS deep_research_sessions_user_id_fkey"))
  op.alter_column("deep_research_sessions", "user_id", nullable=False)
  op.create_foreign_key(
    "fk_deep_research_sessions_user_id",
    "deep_research_sessions",
    "users",
    ["user_id"],
    ["id"],
    ondelete="CASCADE",
  )
  op.add_column("deep_research_sessions", sa.Column("lifecycle_version", sa.Integer(), server_default="0", nullable=False))
  op.add_column("deep_research_sessions", sa.Column("current_generation", sa.Integer(), server_default="1", nullable=False))
  op.add_column("deep_research_sessions", sa.Column("last_event_sequence", sa.BigInteger(), server_default="0", nullable=False))
  op.add_column("deep_research_sessions", sa.Column("correlation_id", sa.String(length=128), nullable=True))
  op.add_column("deep_research_sessions", sa.Column("cancel_requested", sa.Boolean(), server_default=sa.text("false"), nullable=False))
  op.add_column("deep_research_sessions", sa.Column("idempotency_key", sa.String(length=255), nullable=True))
  op.create_unique_constraint(
    "uq_dr_session_user_idempotency",
    "deep_research_sessions",
    ["user_id", "idempotency_key"],
  )
  op.add_column("deep_research_sessions", sa.Column("retention_until", sa.DateTime(timezone=True), nullable=True))
  if bind.dialect.name == "postgresql":
    op.execute(sa.text("UPDATE deep_research_sessions SET correlation_id = 'legacy-' || id::text WHERE correlation_id IS NULL"))
  else:
    op.execute(sa.text("UPDATE deep_research_sessions SET correlation_id = 'legacy-' || CAST(id AS TEXT) WHERE correlation_id IS NULL"))
  op.alter_column("deep_research_sessions", "correlation_id", nullable=False)
  op.alter_column("deep_research_sessions", "status", server_default="queued")
  op.create_check_constraint("ck_dr_session_status", "deep_research_sessions", "status IN ('queued','planning','searching','reading','synthesizing','verifying','running','paused','completed','failed','cancel_requested','cancelled')")
  op.create_check_constraint("ck_dr_session_version_nonnegative", "deep_research_sessions", "lifecycle_version >= 0")
  op.create_check_constraint("ck_dr_session_generation_positive", "deep_research_sessions", "current_generation >= 1")
  op.create_check_constraint("ck_dr_session_sequence_nonnegative", "deep_research_sessions", "last_event_sequence >= 0")

  op.create_table(
    "deep_research_generations",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("session_id", sa.Integer(), sa.ForeignKey("deep_research_sessions.id", ondelete="CASCADE"), nullable=False),
    sa.Column("generation_number", sa.Integer(), nullable=False),
    sa.Column("status", sa.String(length=32), server_default="queued", nullable=False),
    sa.Column("state_version", sa.Integer(), server_default="0", nullable=False),
    sa.Column("last_event_sequence", sa.BigInteger(), server_default="0", nullable=False),
    sa.Column("checkpoint", sa.JSON(), nullable=True),
    sa.Column("checkpoint_bytes", sa.Integer(), nullable=True),
    sa.Column("worker_task_id", sa.String(length=255), nullable=True),
    sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
    sa.Column("lease_token", sa.String(length=128), nullable=True),
    sa.Column("correlation_id", sa.String(length=128), nullable=False),
    sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.UniqueConstraint("session_id", "generation_number", name="uq_dr_generation_number"),
    sa.CheckConstraint("generation_number >= 1", name="ck_dr_generation_positive"),
    sa.CheckConstraint("state_version >= 0", name="ck_dr_generation_version_nonnegative"),
    sa.CheckConstraint("last_event_sequence >= 0", name="ck_dr_generation_sequence_nonnegative"),
  )
  op.create_index("ix_dr_generations_session_id", "deep_research_generations", ["session_id"])
  op.create_index("ix_dr_generations_status", "deep_research_generations", ["status"])
  op.create_index("ix_dr_generations_worker_task_id", "deep_research_generations", ["worker_task_id"])
  op.create_index("ix_dr_generations_correlation_id", "deep_research_generations", ["correlation_id"])
  op.execute(sa.text("""
    INSERT INTO deep_research_generations
      (session_id, generation_number, status, correlation_id)
    SELECT id, current_generation, status, correlation_id
    FROM deep_research_sessions
  """))

  op.create_table(
    "deep_research_events",
    sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column("session_id", sa.Integer(), sa.ForeignKey("deep_research_sessions.id", ondelete="CASCADE"), nullable=False),
    sa.Column("generation_id", sa.Integer(), sa.ForeignKey("deep_research_generations.id", ondelete="CASCADE"), nullable=False),
    sa.Column("sequence", sa.BigInteger(), nullable=False),
    sa.Column("event_type", sa.String(length=64), nullable=False),
    sa.Column("payload", sa.JSON(), nullable=False),
    sa.Column("payload_bytes", sa.Integer(), nullable=False),
    sa.Column("correlation_id", sa.String(length=128), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.UniqueConstraint("generation_id", "sequence", name="uq_dr_event_sequence"),
    sa.CheckConstraint("sequence >= 1", name="ck_dr_event_sequence_positive"),
    sa.CheckConstraint("payload_bytes >= 0", name="ck_dr_event_payload_bytes_nonnegative"),
  )
  op.create_index("ix_dr_events_session_id", "deep_research_events", ["session_id"])
  op.create_index("ix_dr_events_generation_id", "deep_research_events", ["generation_id"])
  op.create_index("ix_dr_events_correlation_id", "deep_research_events", ["correlation_id"])

  op.create_table(
    "deep_research_evidence",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("session_id", sa.Integer(), sa.ForeignKey("deep_research_sessions.id", ondelete="CASCADE"), nullable=False),
    sa.Column("generation_id", sa.Integer(), sa.ForeignKey("deep_research_generations.id", ondelete="CASCADE"), nullable=False),
    sa.Column("provenance_id", sa.String(length=255), nullable=False),
    sa.Column("source_type", sa.String(length=32), nullable=False),
    sa.Column("external_id", sa.String(length=512), nullable=True),
    sa.Column("title", sa.String(length=1024), nullable=False),
    sa.Column("url", sa.String(length=2048), nullable=True),
    sa.Column("metadata_json", sa.JSON(), nullable=True),
    sa.Column("content_hash", sa.String(length=128), nullable=True),
    sa.Column("authorization_status", sa.String(length=32), server_default="verified", nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.UniqueConstraint("generation_id", "provenance_id", name="uq_dr_evidence_provenance"),
  )
  op.create_index("ix_dr_evidence_session_id", "deep_research_evidence", ["session_id"])
  op.create_index("ix_dr_evidence_generation_id", "deep_research_evidence", ["generation_id"])

  op.create_table(
    "deep_research_messages",
    sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column("session_id", sa.Integer(), sa.ForeignKey("deep_research_sessions.id", ondelete="CASCADE"), nullable=False),
    sa.Column("generation_id", sa.Integer(), sa.ForeignKey("deep_research_generations.id", ondelete="CASCADE"), nullable=False),
    sa.Column("sequence", sa.BigInteger(), nullable=False),
    sa.Column("role", sa.String(length=32), nullable=False),
    sa.Column("content", sa.Text(), nullable=False),
    sa.Column("content_bytes", sa.Integer(), nullable=False),
    sa.Column("payload", sa.JSON(), nullable=True),
    sa.Column("correlation_id", sa.String(length=128), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.UniqueConstraint("generation_id", "sequence", name="uq_dr_message_sequence"),
    sa.CheckConstraint("sequence >= 1", name="ck_dr_message_sequence_positive"),
    sa.CheckConstraint("content_bytes >= 0", name="ck_dr_message_content_bytes_nonnegative"),
  )
  op.create_index("ix_dr_messages_session_id", "deep_research_messages", ["session_id"])
  op.create_index("ix_dr_messages_generation_id", "deep_research_messages", ["generation_id"])
  op.create_index("ix_dr_messages_correlation_id", "deep_research_messages", ["correlation_id"])

  op.create_table(
    "deep_research_outbox",
    sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column("session_id", sa.Integer(), sa.ForeignKey("deep_research_sessions.id", ondelete="CASCADE"), nullable=False),
    sa.Column("generation_id", sa.Integer(), sa.ForeignKey("deep_research_generations.id", ondelete="CASCADE"), nullable=False),
    sa.Column("idempotency_key", sa.String(length=255), nullable=False, unique=True),
    sa.Column("event_type", sa.String(length=64), nullable=False),
    sa.Column("payload", sa.JSON(), nullable=False),
    sa.Column("payload_bytes", sa.Integer(), nullable=False),
    sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
    sa.Column("available_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
    sa.Column("last_error", sa.Text(), nullable=True),
    sa.Column("correlation_id", sa.String(length=128), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.CheckConstraint("attempts >= 0", name="ck_dr_outbox_attempts_nonnegative"),
    sa.CheckConstraint("payload_bytes >= 0", name="ck_dr_outbox_payload_bytes_nonnegative"),
  )
  op.create_index("ix_dr_outbox_session_id", "deep_research_outbox", ["session_id"])
  op.create_index("ix_dr_outbox_generation_id", "deep_research_outbox", ["generation_id"])
  op.create_index("ix_dr_outbox_correlation_id", "deep_research_outbox", ["correlation_id"])


def downgrade() -> None:
  for table in (
    "deep_research_outbox",
    "deep_research_messages",
    "deep_research_evidence",
    "deep_research_events",
    "deep_research_generations",
  ):
    op.drop_table(table)
  op.drop_constraint("ck_dr_session_status", "deep_research_sessions", type_="check")
  op.alter_column("deep_research_sessions", "status", server_default="running")
  op.drop_constraint("ck_dr_session_sequence_nonnegative", "deep_research_sessions", type_="check")
  op.drop_constraint("ck_dr_session_generation_positive", "deep_research_sessions", type_="check")
  op.drop_constraint("ck_dr_session_version_nonnegative", "deep_research_sessions", type_="check")
  op.drop_column("deep_research_sessions", "retention_until")
  op.execute(
    sa.text(
      "ALTER TABLE deep_research_sessions "
      "DROP CONSTRAINT IF EXISTS uq_dr_session_user_idempotency"
    )
  )
  op.execute(
    sa.text(
      "ALTER TABLE deep_research_sessions DROP COLUMN IF EXISTS idempotency_key"
    )
  )
  op.drop_column("deep_research_sessions", "cancel_requested")
  op.drop_column("deep_research_sessions", "correlation_id")
  op.drop_column("deep_research_sessions", "last_event_sequence")
  op.drop_column("deep_research_sessions", "current_generation")
  op.drop_column("deep_research_sessions", "lifecycle_version")
  op.drop_constraint("fk_deep_research_sessions_user_id", "deep_research_sessions", type_="foreignkey")
  op.create_foreign_key(
    "deep_research_sessions_user_id_fkey",
    "deep_research_sessions",
    "users",
    ["user_id"],
    ["id"],
    ondelete="SET NULL",
  )
  op.alter_column("deep_research_sessions", "user_id", nullable=True)
  op.drop_table("deep_research_orphans")
