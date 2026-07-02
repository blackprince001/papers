"""Remove unused paper fields (vector_id, merged_from_paper_id, is_duplicate_of)

Revision ID: remove_unused_paper_fields
Revises: cb71c2eaded1
Create Date: 2026-04-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "remove_unused_paper_fields"
down_revision: Union[str, Sequence[str], None] = "add_multi_chat_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Remove unused fields from papers table."""
  op.drop_column("papers", "vector_id")
  op.drop_column("papers", "merged_from_paper_id")
  op.drop_column("papers", "is_duplicate_of")


def downgrade() -> None:
  """Restore removed fields to papers table."""
  op.add_column("papers", sa.Column("vector_id", sa.String(), nullable=True))
  op.add_column(
    "papers",
    sa.Column(
      "merged_from_paper_id",
      sa.Integer(),
      sa.ForeignKey("papers.id", ondelete="SET NULL"),
      nullable=True,
    ),
  )
  op.add_column(
    "papers",
    sa.Column(
      "is_duplicate_of",
      sa.Integer(),
      sa.ForeignKey("papers.id", ondelete="SET NULL"),
      nullable=True,
    ),
  )
