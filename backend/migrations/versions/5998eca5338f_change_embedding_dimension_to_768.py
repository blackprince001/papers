"""change_embedding_dimension_to_1536

Revision ID: 5998eca5338f
Revises: ai_features_001
Create Date: 2026-01-15 09:54:52.259434

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5998eca5338f"
down_revision: Union[str, Sequence[str], None] = "ai_features_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema: change embedding dimension from 384 to 1536."""
  # First, clear all existing embeddings since they're incompatible with new dimension
  op.execute("UPDATE papers SET embedding = NULL")

  # Change the vector column dimension from 384 to 1536
  op.execute("ALTER TABLE papers ALTER COLUMN embedding TYPE vector(1536)")


def downgrade() -> None:
  """Downgrade schema: change embedding dimension from 1536 back to 384."""
  # Clear embeddings as they're incompatible
  op.execute("UPDATE papers SET embedding = NULL")

  # Change the vector column dimension back to 384
  op.execute("ALTER TABLE papers ALTER COLUMN embedding TYPE vector(384)")
