"""add_discovery_tables

Revision ID: add_discovery_tables
Revises: cb71c2eaded1
Create Date: 2026-01-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = 'add_discovery_tables'
down_revision: Union[str, Sequence[str], None] = 'cb71c2eaded1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create discovered_papers table for caching external papers
    op.create_table(
        'discovered_papers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source', sa.String(), nullable=False, index=True),
        sa.Column('external_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('authors', sa.JSON(), server_default='[]'),
        sa.Column('abstract', sa.Text(), nullable=True),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('doi', sa.String(), nullable=True, index=True),
        sa.Column('arxiv_id', sa.String(), nullable=True, index=True),
        sa.Column('url', sa.String(), nullable=True),
        sa.Column('pdf_url', sa.String(), nullable=True),
        sa.Column('citation_count', sa.Integer(), nullable=True),
        sa.Column('embedding', Vector(768), nullable=True),
        sa.Column('metadata_json', sa.JSON(), server_default='{}'),
        sa.Column('discovered_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('source', 'external_id', name='uq_discovered_papers_source_external_id'),
    )

    # Create index for vector similarity search
    op.execute(
        'CREATE INDEX idx_discovered_papers_embedding ON discovered_papers '
        'USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)'
    )

    # Create research_topics table for AI-generated topic clusters
    op.create_table(
        'research_topics',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('keywords', sa.JSON(), server_default='[]'),
        sa.Column('embedding', Vector(768), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Create junction table for discovered papers and topics
    op.create_table(
        'discovered_paper_topics',
        sa.Column('discovered_paper_id', sa.Integer(), sa.ForeignKey('discovered_papers.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('topic_id', sa.Integer(), sa.ForeignKey('research_topics.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('relevance_score', sa.Float(), nullable=True),
    )

    # Create discovery_sessions table for saving search sessions
    op.create_table(
        'discovery_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('query', sa.String(), nullable=False),
        sa.Column('sources', sa.JSON(), server_default='[]'),
        sa.Column('filters_json', sa.JSON(), server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Create junction table for sessions and discovered papers
    op.create_table(
        'discovery_session_papers',
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('discovery_sessions.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('discovered_paper_id', sa.Integer(), sa.ForeignKey('discovered_papers.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('relevance_score', sa.Float(), nullable=True),
        sa.Column('added_to_library', sa.Boolean(), server_default='false'),
        sa.Column('library_paper_id', sa.Integer(), sa.ForeignKey('papers.id', ondelete='SET NULL'), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('discovery_session_papers')
    op.drop_table('discovery_sessions')
    op.drop_table('discovered_paper_topics')
    op.drop_table('research_topics')
    op.execute('DROP INDEX IF EXISTS idx_discovered_papers_embedding')
    op.drop_table('discovered_papers')
