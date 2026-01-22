"""add_processing_status_and_indexes

Revision ID: cb71c2eaded1
Revises: add_thread_support
Create Date: 2026-01-22 12:29:12.805012

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb71c2eaded1'
down_revision: Union[str, Sequence[str], None] = 'add_thread_support'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create the enum type first (required for PostgreSQL)
    processingstatus = sa.Enum('pending', 'processing', 'completed', 'failed', name='processingstatus')
    processingstatus.create(op.get_bind(), checkfirst=True)

    # Add processing_status and processing_error columns
    op.add_column('papers', sa.Column('processing_status', processingstatus, server_default='pending', nullable=False))
    op.add_column('papers', sa.Column('processing_error', sa.Text(), nullable=True))

    # Create indexes for frequently filtered columns
    op.create_index(op.f('ix_papers_processing_status'), 'papers', ['processing_status'], unique=False)
    op.create_index(op.f('ix_papers_reading_status'), 'papers', ['reading_status'], unique=False)

    # Update foreign keys to use SET NULL on delete
    # First drop existing constraints, then recreate with ondelete
    op.drop_constraint('papers_is_duplicate_of_fkey', 'papers', type_='foreignkey')
    op.drop_constraint('papers_merged_from_paper_id_fkey', 'papers', type_='foreignkey')
    op.create_foreign_key('papers_merged_from_paper_id_fkey', 'papers', 'papers', ['merged_from_paper_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('papers_is_duplicate_of_fkey', 'papers', 'papers', ['is_duplicate_of'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    # Restore original foreign keys without ondelete
    op.drop_constraint('papers_is_duplicate_of_fkey', 'papers', type_='foreignkey')
    op.drop_constraint('papers_merged_from_paper_id_fkey', 'papers', type_='foreignkey')
    op.create_foreign_key('papers_merged_from_paper_id_fkey', 'papers', 'papers', ['merged_from_paper_id'], ['id'])
    op.create_foreign_key('papers_is_duplicate_of_fkey', 'papers', 'papers', ['is_duplicate_of'], ['id'])

    # Drop indexes
    op.drop_index(op.f('ix_papers_reading_status'), table_name='papers')
    op.drop_index(op.f('ix_papers_processing_status'), table_name='papers')

    # Drop columns
    op.drop_column('papers', 'processing_error')
    op.drop_column('papers', 'processing_status')

    # Drop the enum type
    sa.Enum(name='processingstatus').drop(op.get_bind(), checkfirst=True)
