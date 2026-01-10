"""add_ai_features

Revision ID: ai_features_001
Revises: citation_cache_001
Create Date: 2026-01-15 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "ai_features_001"
down_revision: Union[str, Sequence[str], None] = "citation_cache_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Add AI features to papers table
  op.add_column("papers", sa.Column("ai_summary", sa.Text(), nullable=True))
  op.add_column(
    "papers",
    sa.Column("summary_generated_at", sa.DateTime(timezone=True), nullable=True),
  )
  op.add_column(
    "papers",
    sa.Column("key_findings", postgresql.JSON(astext_type=sa.Text()), nullable=True),
  )
  op.add_column(
    "papers",
    sa.Column("findings_extracted_at", sa.DateTime(timezone=True), nullable=True),
  )
  op.add_column(
    "papers",
    sa.Column("reading_guide", postgresql.JSON(astext_type=sa.Text()), nullable=True),
  )
  op.add_column(
    "papers", sa.Column("guide_generated_at", sa.DateTime(timezone=True), nullable=True)
  )

  # Create PostgreSQL ENUM type first using raw SQL (works better with async engines)
  op.execute(
    text(
      "CREATE TYPE IF NOT EXISTS highlighttype AS ENUM ('method', 'result', 'conclusion', 'key_contribution')"
    )
  )

  # Add auto-highlight fields to annotations table
  highlight_type_enum = sa.Enum(
    "method", "result", "conclusion", "key_contribution", name="highlighttype"
  )
  op.add_column(
    "annotations",
    sa.Column("auto_highlighted", sa.Boolean(), nullable=False, server_default="false"),
  )
  op.add_column(
    "annotations",
    sa.Column(
      "highlight_type",
      highlight_type_enum,
      nullable=True,
    ),
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column("annotations", "highlight_type")
  op.drop_column("annotations", "auto_highlighted")
  op.drop_column("papers", "guide_generated_at")
  op.drop_column("papers", "reading_guide")
  op.drop_column("papers", "findings_extracted_at")
  op.drop_column("papers", "key_findings")
  op.drop_column("papers", "summary_generated_at")
  op.drop_column("papers", "ai_summary")
  op.execute("DROP TYPE IF EXISTS highlighttype")
