"""add_chat_tables

Revision ID: add_chat_tables_001
Revises: a1b2c3d4e5f6
Create Date: 2026-01-08 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_chat_001"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Create chat_sessions table
  op.create_table(
    "chat_sessions",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("paper_id", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
    sa.UniqueConstraint("paper_id"),
  )
  op.create_index(op.f("ix_chat_sessions_id"), "chat_sessions", ["id"], unique=False)
  op.create_index(
    op.f("ix_chat_sessions_paper_id"), "chat_sessions", ["paper_id"], unique=False
  )

  # Create chat_messages table
  op.create_table(
    "chat_messages",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("session_id", sa.Integer(), nullable=False),
    sa.Column("role", sa.String(), nullable=False),
    sa.Column("content", sa.Text(), nullable=False),
    sa.Column("references", sa.JSON(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_chat_messages_id"), "chat_messages", ["id"], unique=False)
  op.create_index(
    op.f("ix_chat_messages_session_id"), "chat_messages", ["session_id"], unique=False
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_chat_messages_session_id"), table_name="chat_messages")
  op.drop_index(op.f("ix_chat_messages_id"), table_name="chat_messages")
  op.drop_table("chat_messages")
  op.drop_index(op.f("ix_chat_sessions_paper_id"), table_name="chat_sessions")
  op.drop_index(op.f("ix_chat_sessions_id"), table_name="chat_sessions")
  op.drop_table("chat_sessions")
