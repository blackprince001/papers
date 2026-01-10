"""add_citation_cache

Revision ID: citation_cache_001
Revises: duplicate_detection_001
Create Date: 2026-01-15 13:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "citation_cache_001"
down_revision: Union[str, Sequence[str], None] = "duplicate_detection_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Create paper_citations table for caching citation relationships
  op.create_table(
    "paper_citations",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("paper_id", sa.Integer(), nullable=False),
    sa.Column("cited_paper_id", sa.Integer(), nullable=True),
    sa.Column("citation_context", sa.Text(), nullable=True),
    sa.Column("external_paper_title", sa.String(), nullable=True),
    sa.Column("external_paper_doi", sa.String(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["cited_paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_paper_citations_id"), "paper_citations", ["id"], unique=False)
  op.create_index(op.f("ix_paper_citations_paper_id"), "paper_citations", ["paper_id"], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_paper_citations_paper_id"), table_name="paper_citations")
  op.drop_index(op.f("ix_paper_citations_id"), table_name="paper_citations")
  op.drop_table("paper_citations")

