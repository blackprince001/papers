"""Add owner-scoped grounded explanation cache records.

Revision ID: annotation_explanations_001
Revises: deep_research_002
Create Date: 2026-08-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "annotation_explanations_001"
down_revision: Union[str, Sequence[str], None] = "deep_research_002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  op.create_table(
    "annotation_explanations",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column(
      "annotation_id",
      sa.Integer(),
      sa.ForeignKey("annotations.id", ondelete="CASCADE"),
      nullable=False,
    ),
    sa.Column(
      "owner_user_id",
      sa.Integer(),
      sa.ForeignKey("users.id", ondelete="CASCADE"),
      nullable=False,
    ),
    sa.Column("action", sa.String(length=16), nullable=False),
    sa.Column("status", sa.String(length=16), server_default="ready", nullable=False),
    sa.Column(
      "visibility", sa.String(length=16), server_default="private", nullable=False
    ),
    sa.Column("generation", sa.Integer(), server_default="1", nullable=False),
    sa.Column("anchor", postgresql.JSON(astext_type=sa.Text()), nullable=False),
    sa.Column("input_hash", sa.String(length=64), nullable=False),
    sa.Column("prompt_version", sa.String(length=64), nullable=False),
    sa.Column("provider", sa.String(length=64), nullable=True),
    sa.Column("model", sa.String(length=128), nullable=True),
    sa.Column("answer", sa.Text(), nullable=True),
    sa.Column(
      "evidence",
      postgresql.JSON(astext_type=sa.Text()),
      server_default=sa.text("'[]'::json"),
      nullable=False,
    ),
    sa.Column("error_code", sa.String(length=64), nullable=True),
    sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    sa.Column("retention_until", sa.DateTime(timezone=True), nullable=False),
    sa.Column(
      "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    ),
    sa.Column(
      "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    ),
    sa.UniqueConstraint(
      "annotation_id",
      "owner_user_id",
      "generation",
      name="uq_annotation_explanation_generation",
    ),
    sa.UniqueConstraint(
      "owner_user_id",
      "idempotency_key",
      name="uq_annotation_explanation_idempotency",
    ),
    sa.CheckConstraint(
      "action IN ('explain','why','define')",
      name="ck_annotation_explanation_action",
    ),
    sa.CheckConstraint(
      "status IN ('queued','generating','ready','failed','expired')",
      name="ck_annotation_explanation_status",
    ),
    sa.CheckConstraint(
      "visibility IN ('private','paper')",
      name="ck_annotation_explanation_visibility",
    ),
    sa.CheckConstraint("generation >= 1", name="ck_annotation_explanation_generation"),
  )
  op.create_index(
    "ix_annotation_explanations_annotation_id",
    "annotation_explanations",
    ["annotation_id"],
  )
  op.create_index(
    "ix_annotation_explanations_owner_user_id",
    "annotation_explanations",
    ["owner_user_id"],
  )


def downgrade() -> None:
  op.drop_index(
    "ix_annotation_explanations_owner_user_id", table_name="annotation_explanations"
  )
  op.drop_index(
    "ix_annotation_explanations_annotation_id", table_name="annotation_explanations"
  )
  op.drop_table("annotation_explanations")
