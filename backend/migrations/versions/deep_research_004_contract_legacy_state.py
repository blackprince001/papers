"""Contract the legacy session checkpoint during the generation cutover.

The previous implementation stored an agent input list on the session row. The
durable lifecycle already has a generation checkpoint, so this migration copies
that data first, fences any run that was active during the cutover, and then
removes the legacy column. Active rows are paused with a durable event instead
of being presented as resumable from an unverified old worker.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "deep_research_004"
down_revision = "deep_research_003"
branch_labels = None
depends_on = None

_ACTIVE_STATUSES = (
  "queued",
  "planning",
  "searching",
  "reading",
  "synthesizing",
  "verifying",
  "running",
  "cancel_requested",
)


def upgrade() -> None:
  bind = op.get_bind()

  # Preserve any existing checkpoint on the generation before the session
  # projection disappears. The byte count is a guardrail, not a client field.
  bind.execute(
    sa.text(
      """
      UPDATE deep_research_generations AS generation
      SET checkpoint = session.run_state,
          checkpoint_bytes = COALESCE(length(CAST(session.run_state AS text)), 0),
          state_version = generation.state_version + 1
      FROM deep_research_sessions AS session
      WHERE generation.session_id = session.id
        AND generation.generation_number = session.current_generation
        AND session.run_state IS NOT NULL
        AND generation.checkpoint IS NULL
      """
    )
  )

  rows = bind.execute(
    sa.text(
      """
      SELECT session.id AS session_id,
             session.correlation_id AS correlation_id,
             generation.id AS generation_id,
             generation.last_event_sequence AS last_event_sequence
      FROM deep_research_sessions AS session
      JOIN deep_research_generations AS generation
        ON generation.session_id = session.id
       AND generation.generation_number = session.current_generation
      WHERE session.status IN :active_statuses
      """
    ).bindparams(sa.bindparam("active_statuses", expanding=True)),
    {"active_statuses": list(_ACTIVE_STATUSES)},
  ).mappings().all()

  now = datetime.now(timezone.utc)
  message = (
    "This research run was paused during a lifecycle upgrade. "
    "Its saved report is still available, but the old worker cannot be resumed. "
    "Start a new research run to continue."
  )
  for row in rows:
    sequence = int(row["last_event_sequence"] or 0) + 1
    payload = {
      "type": "paused",
      "error": message,
      "error_code": "legacy_checkpoint_migrated",
      "recoverable": False,
    }
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    bind.execute(
      sa.text(
        """
        INSERT INTO deep_research_events
          (session_id, generation_id, sequence, event_type, payload,
           payload_bytes, correlation_id, created_at)
        VALUES
          (:session_id, :generation_id, :sequence, 'paused',
           CAST(:payload AS JSON), :payload_bytes, :correlation_id, :created_at)
        """
      ),
      {
        "session_id": row["session_id"],
        "generation_id": row["generation_id"],
        "sequence": sequence,
        "payload": encoded,
        "payload_bytes": len(encoded.encode("utf-8")),
        "correlation_id": row["correlation_id"],
        "created_at": now,
      },
    )
    bind.execute(
      sa.text(
        """
        UPDATE deep_research_sessions
        SET status = 'paused',
            last_error_code = 'legacy_checkpoint_migrated',
            cancel_requested = false,
            lifecycle_version = lifecycle_version + 1,
            last_event_sequence = :sequence,
            updated_at = :updated_at
        WHERE id = :session_id
        """
      ),
      {"session_id": row["session_id"], "sequence": sequence, "updated_at": now},
    )
    bind.execute(
      sa.text(
        """
        UPDATE deep_research_generations
        SET status = 'paused',
            lease_until = NULL,
            lease_token = NULL,
            finished_at = :finished_at,
            last_event_sequence = :sequence,
            state_version = state_version + 1,
            updated_at = :updated_at
        WHERE id = :generation_id
        """
      ),
      {
        "generation_id": row["generation_id"],
        "sequence": sequence,
        "finished_at": now,
        "updated_at": now,
      },
    )

  op.drop_column("deep_research_sessions", "run_state")


def downgrade() -> None:
  op.add_column("deep_research_sessions", sa.Column("run_state", sa.JSON(), nullable=True))
  bind = op.get_bind()
  bind.execute(
    sa.text(
      """
      UPDATE deep_research_sessions AS session
      SET run_state = generation.checkpoint
      FROM deep_research_generations AS generation
      WHERE generation.session_id = session.id
        AND generation.generation_number = session.current_generation
      """
    )
  )
