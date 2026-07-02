"""add reference_manifest to chat_messages and multi_chat_messages

Revision ID: c79b3de432d9
Revises: drop_user_ai_embedding_columns
Create Date: 2026-06-18 21:33:47.315729

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c79b3de432d9"
down_revision: Union[str, Sequence[str], None] = "drop_user_ai_embedding_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  op.add_column(
    "chat_messages", sa.Column("reference_manifest", sa.JSON(), nullable=True)
  )
  op.add_column(
    "multi_chat_messages", sa.Column("reference_manifest", sa.JSON(), nullable=True)
  )


def downgrade() -> None:
  op.drop_column("multi_chat_messages", "reference_manifest")
  op.drop_column("chat_messages", "reference_manifest")
