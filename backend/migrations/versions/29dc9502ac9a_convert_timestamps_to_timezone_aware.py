"""convert_timestamps_to_timezone_aware

Revision ID: 29dc9502ac9a
Revises: 3bf56faa48ce
Create Date: 2026-01-07 15:03:20.533512

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "29dc9502ac9a"
down_revision: Union[str, Sequence[str], None] = "3bf56faa48ce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  """Upgrade schema."""
  # Convert groups table timestamps
  op.execute(
    "ALTER TABLE groups ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC'"
  )
  op.execute(
    "ALTER TABLE groups ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE USING updated_at AT TIME ZONE 'UTC'"
  )

  # Convert papers table timestamps
  op.execute(
    "ALTER TABLE papers ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC'"
  )
  op.execute(
    "ALTER TABLE papers ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE USING updated_at AT TIME ZONE 'UTC'"
  )

  # Convert annotations table timestamps
  op.execute(
    "ALTER TABLE annotations ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC'"
  )
  op.execute(
    "ALTER TABLE annotations ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE USING updated_at AT TIME ZONE 'UTC'"
  )


def downgrade() -> None:
  """Downgrade schema."""
  # Convert groups table timestamps back
  op.execute(
    "ALTER TABLE groups ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE USING created_at AT TIME ZONE 'UTC'"
  )
  op.execute(
    "ALTER TABLE groups ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE USING updated_at AT TIME ZONE 'UTC'"
  )

  # Convert papers table timestamps back
  op.execute(
    "ALTER TABLE papers ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE USING created_at AT TIME ZONE 'UTC'"
  )
  op.execute(
    "ALTER TABLE papers ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE USING updated_at AT TIME ZONE 'UTC'"
  )

  # Convert annotations table timestamps back
  op.execute(
    "ALTER TABLE annotations ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE USING created_at AT TIME ZONE 'UTC'"
  )
  op.execute(
    "ALTER TABLE annotations ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE USING updated_at AT TIME ZONE 'UTC'"
  )
