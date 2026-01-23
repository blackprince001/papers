"""remove_unused_discovery_tables

Revision ID: remove_unused_discovery_tables
Revises: add_discovery_session_insights
Create Date: 2026-01-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'remove_unused_discovery_tables'
down_revision: Union[str, Sequence[str], None] = 'add_discovery_session_insights'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove unused research_topics and discovered_paper_topics tables."""
    # Drop the junction table first due to foreign key constraints
    op.drop_table('discovered_paper_topics')
    # Drop the research_topics table
    op.drop_table('research_topics')


def downgrade() -> None:
    """Recreate research_topics and discovered_paper_topics tables."""
    from pgvector.sqlalchemy import Vector

    # Recreate research_topics table
    op.create_table(
        'research_topics',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('keywords', sa.JSON(), server_default='[]'),
        sa.Column('embedding', Vector(768), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Recreate junction table for discovered papers and topics
    op.create_table(
        'discovered_paper_topics',
        sa.Column('discovered_paper_id', sa.Integer(), sa.ForeignKey('discovered_papers.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('topic_id', sa.Integer(), sa.ForeignKey('research_topics.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('relevance_score', sa.Float(), nullable=True),
    )
