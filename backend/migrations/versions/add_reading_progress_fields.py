"""add_reading_progress_fields

Revision ID: reading_progress_001
Revises: 30836c5c1a86
Create Date: 2026-01-15 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "reading_progress_001"
down_revision: Union[str, Sequence[str], None] = "30836c5c1a86"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Create PostgreSQL ENUM types first using raw SQL
  # PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE, so we use DO blocks
  op.execute(
    text(
      """
      DO $$ BEGIN
        CREATE TYPE readingstatus AS ENUM ('not_started', 'in_progress', 'read', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
      """
    )
  )
  op.execute(
    text(
      """
      DO $$ BEGIN
        CREATE TYPE prioritylevel AS ENUM ('low', 'medium', 'high', 'critical');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
      """
    )
  )

  # Add reading progress fields to papers table
  reading_status_enum = sa.Enum(
    "not_started", "in_progress", "read", "archived", name="readingstatus"
  )
  priority_level_enum = sa.Enum(
    "low", "medium", "high", "critical", name="prioritylevel"
  )

  op.add_column(
    "papers",
    sa.Column(
      "reading_status",
      reading_status_enum,
      nullable=False,
      server_default="not_started",
    ),
  )
  op.add_column(
    "papers",
    sa.Column("reading_time_minutes", sa.Integer(), nullable=False, server_default="0"),
  )
  op.add_column("papers", sa.Column("last_read_page", sa.Integer(), nullable=True))
  op.add_column(
    "papers",
    sa.Column(
      "priority",
      priority_level_enum,
      nullable=False,
      server_default="low",
    ),
  )
  op.add_column(
    "papers", sa.Column("status_updated_at", sa.DateTime(timezone=True), nullable=True)
  )
  op.add_column(
    "papers", sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True)
  )

  # Create reading_sessions table
  op.create_table(
    "reading_sessions",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("paper_id", sa.Integer(), nullable=False),
    sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
    sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
    sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("pages_viewed", sa.Integer(), nullable=False, server_default="0"),
    sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(
    op.f("ix_reading_sessions_id"), "reading_sessions", ["id"], unique=False
  )
  op.create_index(
    op.f("ix_reading_sessions_paper_id"), "reading_sessions", ["paper_id"], unique=False
  )

  # Create bookmarks table
  op.create_table(
    "bookmarks",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("paper_id", sa.Integer(), nullable=False),
    sa.Column("page_number", sa.Integer(), nullable=False),
    sa.Column("note", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_bookmarks_id"), "bookmarks", ["id"], unique=False)
  op.create_index(
    op.f("ix_bookmarks_paper_id"), "bookmarks", ["paper_id"], unique=False
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_bookmarks_paper_id"), table_name="bookmarks")
  op.drop_index(op.f("ix_bookmarks_id"), table_name="bookmarks")
  op.drop_table("bookmarks")
  op.drop_index(op.f("ix_reading_sessions_paper_id"), table_name="reading_sessions")
  op.drop_index(op.f("ix_reading_sessions_id"), table_name="reading_sessions")
  op.drop_table("reading_sessions")
  op.drop_column("papers", "last_read_at")
  op.drop_column("papers", "status_updated_at")
  op.drop_column("papers", "priority")
  op.drop_column("papers", "last_read_page")
  op.drop_column("papers", "reading_time_minutes")
  op.drop_column("papers", "reading_status")
  op.execute("DROP TYPE IF EXISTS readingstatus")
  op.execute("DROP TYPE IF EXISTS prioritylevel")
