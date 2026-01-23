"""add_discovery_session_insights

Revision ID: add_discovery_session_insights
Revises: add_discovery_tables
Create Date: 2026-01-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_discovery_session_insights'
down_revision: Union[str, Sequence[str], None] = 'add_discovery_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add AI insights columns to discovery_sessions."""
    # Add columns for storing AI insights
    op.add_column('discovery_sessions', sa.Column('query_understanding', sa.JSON(), nullable=True))
    op.add_column('discovery_sessions', sa.Column('overview', sa.JSON(), nullable=True))
    op.add_column('discovery_sessions', sa.Column('clustering', sa.JSON(), nullable=True))
    op.add_column('discovery_sessions', sa.Column('relevance_explanations', sa.JSON(), nullable=True))
    # Store papers as JSON for quick loading
    op.add_column('discovery_sessions', sa.Column('papers_json', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove AI insights columns from discovery_sessions."""
    op.drop_column('discovery_sessions', 'papers_json')
    op.drop_column('discovery_sessions', 'relevance_explanations')
    op.drop_column('discovery_sessions', 'clustering')
    op.drop_column('discovery_sessions', 'overview')
    op.drop_column('discovery_sessions', 'query_understanding')
