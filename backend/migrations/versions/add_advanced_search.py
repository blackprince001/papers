"""add_advanced_search

Revision ID: advanced_search_001
Revises: reading_progress_001
Create Date: 2026-01-15 11:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "advanced_search_001"
down_revision: Union[str, Sequence[str], None] = "reading_progress_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Create saved_searches table
  op.create_table(
    "saved_searches",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("name", sa.String(), nullable=False),
    sa.Column("description", sa.Text(), nullable=True),
    sa.Column("query_params", postgresql.JSON(astext_type=sa.Text()), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_saved_searches_id"), "saved_searches", ["id"], unique=False)

  # Add full-text search indexes
  # For papers.content_text
  op.execute("""
    CREATE INDEX IF NOT EXISTS papers_content_text_fts_idx 
    ON papers USING GIN (to_tsvector('english', COALESCE(content_text, '')));
  """)
  
  # For papers.title
  op.execute("""
    CREATE INDEX IF NOT EXISTS papers_title_fts_idx 
    ON papers USING GIN (to_tsvector('english', COALESCE(title, '')));
  """)
  
  # For annotations.content
  op.execute("""
    CREATE INDEX IF NOT EXISTS annotations_content_fts_idx 
    ON annotations USING GIN (to_tsvector('english', COALESCE(content, '')));
  """)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index("annotations_content_fts_idx", table_name="annotations")
  op.drop_index("papers_title_fts_idx", table_name="papers")
  op.drop_index("papers_content_text_fts_idx", table_name="papers")
  op.drop_index(op.f("ix_saved_searches_id"), table_name="saved_searches")
  op.drop_table("saved_searches")

