"""Add user_paper_state.last_opened_at for server-side recents

Revision ID: add_last_opened_at
Revises: add_provider_timeout_seconds
Create Date: 2026-07-03
"""

import sqlalchemy as sa
from alembic import op

revision = "add_last_opened_at"
down_revision = "add_provider_timeout_seconds"
branch_labels = None
depends_on = None


def upgrade() -> None:
  op.add_column(
    "user_paper_state",
    sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True),
  )
  op.create_index(
    "ix_user_paper_state_last_opened_at",
    "user_paper_state",
    ["last_opened_at"],
  )


def downgrade() -> None:
  op.drop_index("ix_user_paper_state_last_opened_at", table_name="user_paper_state")
  op.drop_column("user_paper_state", "last_opened_at")
