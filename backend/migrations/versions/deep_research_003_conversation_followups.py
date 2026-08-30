"""Add explicit deep-research conversation and provider-pin fields.

Revision ID: deep_research_003
Revises: deep_research_002
"""

import sqlalchemy as sa
from alembic import op

revision = "deep_research_003"
down_revision = "deep_research_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column(
    "deep_research_generations",
    sa.Column("mode", sa.String(length=16), server_default="research", nullable=False),
  )
  op.add_column(
    "deep_research_generations",
    sa.Column("provider_id", sa.Integer(), nullable=True),
  )
  op.add_column(
    "deep_research_generations",
    sa.Column("provider_type", sa.String(length=64), nullable=True),
  )
  op.add_column(
    "deep_research_generations",
    sa.Column("model", sa.String(length=128), nullable=True),
  )
  op.create_foreign_key(
    "fk_dr_generation_provider_id",
    "deep_research_generations",
    "user_ai_providers",
    ["provider_id"],
    ["id"],
    ondelete="SET NULL",
  )
  op.create_index(
    "ix_dr_generations_provider_id",
    "deep_research_generations",
    ["provider_id"],
  )
  op.create_check_constraint(
    "ck_dr_generation_mode",
    "deep_research_generations",
    "mode IN ('research','ask')",
  )

  op.add_column(
    "deep_research_messages",
    sa.Column("mode", sa.String(length=16), server_default="research", nullable=False),
  )
  op.add_column(
    "deep_research_messages",
    sa.Column("idempotency_key", sa.String(length=255), nullable=True),
  )
  op.create_unique_constraint(
    "uq_dr_message_idempotency",
    "deep_research_messages",
    ["session_id", "idempotency_key"],
  )
  op.create_check_constraint(
    "ck_dr_message_mode",
    "deep_research_messages",
    "mode IN ('research','ask')",
  )


def downgrade() -> None:
  op.drop_constraint("ck_dr_message_mode", "deep_research_messages", type_="check")
  op.drop_constraint(
    "uq_dr_message_idempotency", "deep_research_messages", type_="unique"
  )
  op.drop_column("deep_research_messages", "idempotency_key")
  op.drop_column("deep_research_messages", "mode")

  op.drop_constraint("ck_dr_generation_mode", "deep_research_generations", type_="check")
  op.drop_index("ix_dr_generations_provider_id", table_name="deep_research_generations")
  op.drop_constraint(
    "fk_dr_generation_provider_id", "deep_research_generations", type_="foreignkey"
  )
  op.drop_column("deep_research_generations", "model")
  op.drop_column("deep_research_generations", "provider_type")
  op.drop_column("deep_research_generations", "provider_id")
  op.drop_column("deep_research_generations", "mode")
