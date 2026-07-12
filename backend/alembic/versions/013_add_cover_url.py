"""Add cover_url to music for track cover art

Revision ID: 013
Revises: 012
Create Date: 2026-07-12 12:00:00.000000

Adds a nullable ``cover_url`` column to ``music`` so each track can
carry an album/cover-art URL.  Populated by:

- ``POST /api/spotify/add`` (from ``album.images[0].url``)
- ``POST /api/music/upload`` (from the ``/auto-tag`` Spotify lookup)

NULL for tracks where no cover was found — the frontend renders a
minimalist placeholder in that case.
"""

from alembic import op
import sqlalchemy as sa


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("cover_url", sa.String(length=512), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.drop_column("cover_url")
