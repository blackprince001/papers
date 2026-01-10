"""add_parent_id_to_groups

Revision ID: b2c3d4e5f6a7
Revises: add_chat_001
Create Date: 2026-01-09 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "add_chat_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Drop the existing unique index on name
  op.drop_index(op.f("ix_groups_name"), table_name="groups")

  # Add parent_id column with foreign key
  op.add_column(
    "groups",
    sa.Column("parent_id", sa.Integer(), nullable=True),
  )
  op.create_foreign_key(
    "fk_groups_parent_id",
    "groups",
    "groups",
    ["parent_id"],
    ["id"],
    ondelete="CASCADE",
  )
  op.create_index(op.f("ix_groups_parent_id"), "groups", ["parent_id"], unique=False)

  # Create partial unique indexes to handle NULL parent_id correctly
  # PostgreSQL treats NULLs as distinct in unique constraints, so we use partial indexes

  # Partial unique index for top-level groups (where parent_id IS NULL)
  # This ensures top-level groups have unique names
  op.execute(
    "CREATE UNIQUE INDEX uq_groups_top_level_name ON groups (name) WHERE parent_id IS NULL"
  )

  # Partial unique index for sub-groups (where parent_id IS NOT NULL)
  # This ensures sub-groups have unique names within the same parent
  op.execute(
    "CREATE UNIQUE INDEX uq_groups_parent_name ON groups (parent_id, name) WHERE parent_id IS NOT NULL"
  )

  # Recreate index on name for performance (non-unique now)
  op.create_index(op.f("ix_groups_name"), "groups", ["name"], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  # Drop the partial unique indexes
  op.execute("DROP INDEX IF EXISTS uq_groups_top_level_name")
  op.execute("DROP INDEX IF EXISTS uq_groups_parent_name")

  # Drop parent_id column and related constraints
  op.drop_index(op.f("ix_groups_parent_id"), table_name="groups")
  op.drop_constraint("fk_groups_parent_id", "groups", type_="foreignkey")
  op.drop_column("groups", "parent_id")

  # Recreate unique index on name
  op.drop_index(op.f("ix_groups_name"), table_name="groups")
  op.create_index(op.f("ix_groups_name"), "groups", ["name"], unique=True)
