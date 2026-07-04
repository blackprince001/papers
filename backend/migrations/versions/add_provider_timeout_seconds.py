"""add timeout_seconds to user_ai_providers

Revision ID: add_provider_timeout_seconds
Revises: citation_map_001
Create Date: 2026-07-02 11:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_provider_timeout_seconds"
down_revision: Union[str, Sequence[str], None] = "citation_map_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  op.add_column(
    "user_ai_providers",
    sa.Column("timeout_seconds", sa.Integer(), nullable=True, server_default="120"),
  )


def downgrade() -> None:
  op.drop_column("user_ai_providers", "timeout_seconds")
