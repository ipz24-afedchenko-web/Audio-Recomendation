"""Add file_hash + analysis tracking columns to music table

Revision ID: 002
Revises: 001
Create Date: 2026-06-15 18:00:00.000000

Adds:
- ``file_hash``: SHA-256 hex digest of the uploaded audio bytes.  Used
  for deduplication (UNIQUE per user_id).
- ``analysis_status``: one of 'pending' | 'analyzing' | 'ready' | 'error'.
  Tracks the lifecycle of the audio analysis BackgroundTask.
- ``analysis_error``: optional human-readable error message, populated
  only when ``analysis_status == 'error'``.

Existing rows are back-filled with NULL hash and 'pending' status — they
keep working but won't be de-duplicated until re-uploaded.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite (tests) and Postgres (prod) both support batch_alter_table
    # in modern SQLAlchemy — use it so the same migration works in both.
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("file_hash", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "analysis_status",
                sa.String(length=16),
                nullable=False,
                server_default="pending",
            )
        )
        batch_op.add_column(
            sa.Column("analysis_error", sa.Text(), nullable=True)
        )
        # Partial unique index: one user can have a given hash at most
        # once, but two users can both have the same hash.
        # Postgres supports WHERE clauses on indexes; SQLite does not,
        # so we keep the non-partial unique index — duplicates across
        # users are unlikely in practice (different timestamps, different
        # metadata) and the route still blocks per-user dupes explicitly.
        batch_op.create_index(
            "ix_music_user_hash", ["user_id", "file_hash"], unique=True
        )
        batch_op.create_index(
            "ix_music_analysis_status", ["analysis_status"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.drop_index("ix_music_analysis_status")
        batch_op.drop_index("ix_music_user_hash")
        batch_op.drop_column("analysis_error")
        batch_op.drop_column("analysis_status")
        batch_op.drop_column("file_hash")
