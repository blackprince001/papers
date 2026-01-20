"""Add thread support with parent_message_id

Revision ID: add_thread_support
Revises: 8f161a2cf71e
Create Date: 2026-01-20 10:58:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_thread_support"
down_revision: Union[str, Sequence[str], None] = "81059d98c20c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add parent_message_id column for thread support."""
    # Add nullable parent_message_id column for thread replies
    op.add_column(
        "chat_messages",
        sa.Column("parent_message_id", sa.Integer(), nullable=True),
    )

    # Create foreign key constraint with cascade delete
    op.create_foreign_key(
        "fk_chat_messages_parent",
        "chat_messages",
        "chat_messages",
        ["parent_message_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Create index for efficient thread queries
    op.create_index(
        "ix_chat_messages_parent_message_id",
        "chat_messages",
        ["parent_message_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove thread support."""
    op.drop_index("ix_chat_messages_parent_message_id", table_name="chat_messages")
    op.drop_constraint("fk_chat_messages_parent", "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "parent_message_id")
