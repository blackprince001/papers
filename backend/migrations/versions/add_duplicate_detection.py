"""add_duplicate_detection

Revision ID: duplicate_detection_001
Revises: advanced_search_001
Create Date: 2026-01-15 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "duplicate_detection_001"
down_revision: Union[str, Sequence[str], None] = "advanced_search_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Add duplicate tracking fields to papers table
  op.add_column("papers", sa.Column("merged_from_paper_id", sa.Integer(), nullable=True))
  op.add_column("papers", sa.Column("is_duplicate_of", sa.Integer(), nullable=True))
  op.create_foreign_key(
    "fk_papers_merged_from", "papers", "papers", ["merged_from_paper_id"], ["id"]
  )
  op.create_foreign_key(
    "fk_papers_is_duplicate", "papers", "papers", ["is_duplicate_of"], ["id"]
  )

  # Create duplicate_detection_log table
  op.create_table(
    "duplicate_detection_log",
    sa.Column("id", sa.Integer(), nullable=False),
    sa.Column("paper_id", sa.Integer(), nullable=False),
    sa.Column("duplicate_paper_id", sa.Integer(), nullable=False),
    sa.Column("confidence_score", sa.Float(), nullable=False),
    sa.Column("detection_method", sa.String(), nullable=False),
    sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("merged", sa.Boolean(), nullable=False, server_default="false"),
    sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["duplicate_paper_id"], ["papers.id"], ondelete="CASCADE"),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index(op.f("ix_duplicate_detection_log_id"), "duplicate_detection_log", ["id"], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_duplicate_detection_log_id"), table_name="duplicate_detection_log")
  op.drop_table("duplicate_detection_log")
  op.drop_constraint("fk_papers_is_duplicate", "papers", type_="foreignkey")
  op.drop_constraint("fk_papers_merged_from", "papers", type_="foreignkey")
  op.drop_column("papers", "is_duplicate_of")
  op.drop_column("papers", "merged_from_paper_id")

