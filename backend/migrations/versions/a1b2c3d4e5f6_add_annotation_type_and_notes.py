"""add_annotation_type_and_notes

Revision ID: a1b2c3d4e5f6
Revises: 29dc9502ac9a
Create Date: 2026-01-08 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "29dc9502ac9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Add type field with default 'annotation'
  op.add_column(
    "annotations",
    sa.Column("type", sa.String(), nullable=False, server_default="annotation"),
  )

  # Add highlighted_text field (nullable)
  op.add_column("annotations", sa.Column("highlighted_text", sa.Text(), nullable=True))

  # Add selection_data field (JSON, nullable)
  op.add_column("annotations", sa.Column("selection_data", sa.JSON(), nullable=True))

  # Add note_scope field (nullable, for notes: 'page' or 'document')
  op.add_column("annotations", sa.Column("note_scope", sa.String(), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column("annotations", "note_scope")
  op.drop_column("annotations", "selection_data")
  op.drop_column("annotations", "highlighted_text")
  op.drop_column("annotations", "type")









