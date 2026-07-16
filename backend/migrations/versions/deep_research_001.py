"""Add deep_research_sessions table

Revision ID: deep_research_001
Revises: add_last_opened_at
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from alembic import op

revision = "deep_research_001"
down_revision = "add_last_opened_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.create_table(
    "deep_research_sessions",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column(
      "user_id",
      sa.Integer(),
      sa.ForeignKey("users.id", ondelete="SET NULL"),
      nullable=True,
      index=True,
    ),
    sa.Column("question", sa.Text(), nullable=False),
    sa.Column("title", sa.String(), nullable=True),
    sa.Column(
      "status", sa.String(), nullable=False, server_default="running", index=True
    ),
    sa.Column("report", sa.Text(), nullable=True),
    sa.Column("cited_sources", sa.JSON(), nullable=True),
    sa.Column("run_state", sa.JSON(), nullable=True),
    sa.Column("last_error_code", sa.String(), nullable=True),
    sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
  )


def downgrade() -> None:
  op.drop_table("deep_research_sessions")
