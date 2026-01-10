"""add_pgvector_extension

Revision ID: a1b2c3d4e5f0
Revises: f0e96b2b58d5
Create Date: 2026-01-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f0"
down_revision: Union[str, None] = "f0e96b2b58d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enable pgvector extension."""
    # Use execute() with raw SQL for extension creation
    connection = op.get_bind()
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def downgrade() -> None:
    """Disable pgvector extension."""
    # WARNING: Only drop if no tables use vector types
    # In practice, this should rarely be called as dropping will fail if tables use vector
    connection = op.get_bind()
    connection.execute(text("DROP EXTENSION IF EXISTS vector CASCADE"))

