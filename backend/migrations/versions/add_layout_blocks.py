"""Add layout_blocks JSON + extraction timestamp to papers

Revision ID: add_layout_blocks
Revises: add_citation_canvas_items
Create Date: 2026-06-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_layout_blocks"
down_revision: Union[str, None] = "add_citation_canvas_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Add PDF layout block storage to papers."""
  op.add_column("papers", sa.Column("layout_blocks", sa.JSON(), nullable=True))
  op.add_column(
    "papers",
    sa.Column("layout_extracted_at", sa.DateTime(timezone=True), nullable=True),
  )


def downgrade() -> None:
  """Remove PDF layout block storage from papers."""
  op.drop_column("papers", "layout_extracted_at")
  op.drop_column("papers", "layout_blocks")
