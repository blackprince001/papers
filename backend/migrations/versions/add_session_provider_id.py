"""add_session_provider_id

Adds a nullable ``provider_id`` to chat_sessions and multi_chat_sessions so a
chat session can pin (and remember) which user AI provider it is using.

Revision ID: add_session_provider_id
Revises: add_user_ai_providers
Create Date: 2026-06-13 11:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_session_provider_id"
down_revision: Union[str, Sequence[str], None] = "add_user_ai_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  for table in ("chat_sessions", "multi_chat_sessions"):
    op.add_column(
      table,
      sa.Column("provider_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
      f"fk_{table}_provider_id",
      table,
      "user_ai_providers",
      ["provider_id"],
      ["id"],
      ondelete="SET NULL",
    )


def downgrade() -> None:
  """Downgrade schema."""
  for table in ("chat_sessions", "multi_chat_sessions"):
    op.drop_constraint(f"fk_{table}_provider_id", table, type_="foreignkey")
    op.drop_column(table, "provider_id")
