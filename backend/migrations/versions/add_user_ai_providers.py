"""add_user_ai_providers

Adds the ``user_ai_providers`` table for BYO multi-provider support and
backfills it from the existing single-row ``user_ai_settings`` table.

Revision ID: add_user_ai_providers
Revises: add_user_ai_settings
Create Date: 2026-06-13 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_user_ai_providers"
down_revision: Union[str, Sequence[str], None] = "add_user_ai_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    "user_ai_providers",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("user_id", sa.Integer(), nullable=False),
    sa.Column("label", sa.String(100), nullable=False, server_default=""),
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
      "is_default",
      sa.Boolean(),
      nullable=False,
      server_default="false",
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
    op.f("ix_user_ai_providers_id"),
    "user_ai_providers",
    ["id"],
    unique=False,
  )
  op.create_index(
    op.f("ix_user_ai_providers_user_id"),
    "user_ai_providers",
    ["user_id"],
    unique=False,
  )

  # Backfill: copy each existing user_ai_settings row into a default provider.
  op.execute(
    """
    INSERT INTO user_ai_providers (
      user_id, label, provider, api_key, base_url, model,
      embedding_model, embedding_dimension, is_default, is_active,
      created_at, updated_at
    )
    SELECT
      user_id,
      'Default',
      provider,
      api_key,
      base_url,
      model,
      embedding_model,
      embedding_dimension,
      true,
      is_active,
      created_at,
      updated_at
    FROM user_ai_settings
    """
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_user_ai_providers_user_id"), table_name="user_ai_providers")
  op.drop_index(op.f("ix_user_ai_providers_id"), table_name="user_ai_providers")
  op.drop_table("user_ai_providers")
