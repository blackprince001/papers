"""add_user_ai_settings

Revision ID: add_user_ai_settings
Revises: add_ai_action_highlight_types
Create Date: 2026-06-12 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_user_ai_settings"
down_revision: Union[str, Sequence[str], None] = "add_ai_action_highlight_types"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    "user_ai_settings",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("user_id", sa.Integer(), nullable=False),
    sa.Column(
      "provider",
      sa.String(50),
      nullable=False,
      server_default="openai-compatible",
    ),
    sa.Column("api_key", sa.Text(), nullable=True),
    sa.Column("base_url", sa.String(500), nullable=True),
    sa.Column("model", sa.String(100), nullable=False, server_default=""),
    sa.Column("embedding_model", sa.String(100), nullable=False, server_default=""),
    sa.Column(
      "embedding_dimension",
      sa.Integer(),
      nullable=False,
      server_default="768",
    ),
    sa.Column(
      "is_active",
      sa.Boolean(),
      nullable=False,
      server_default="true",
    ),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(
    op.f("ix_user_ai_settings_id"),
    "user_ai_settings",
    ["id"],
    unique=False,
  )
  op.create_index(
    op.f("ix_user_ai_settings_user_id"),
    "user_ai_settings",
    ["user_id"],
    unique=True,
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_user_ai_settings_user_id"), table_name="user_ai_settings")
  op.drop_index(op.f("ix_user_ai_settings_id"), table_name="user_ai_settings")
  op.drop_table("user_ai_settings")
