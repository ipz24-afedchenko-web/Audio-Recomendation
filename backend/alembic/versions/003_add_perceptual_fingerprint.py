"""Add perceptual_fingerprint column to audio_features

Revision ID: 003
Revises: 002
Create Date: 2026-07-08 19:30:00.000000

Adds:
- ``perceptual_fingerprint``: JSON array of 64 floats (mel-spectrogram
  mean + std).  Computed by ``audio_utils.compute_perceptual_fingerprint``
  during audio analysis.  Used for format-robust deduplication (e.g. the
  same song uploaded as MP3 and WAV).

Existing rows get NULL — they function normally but cannot participate
in perceptual dedup until re-analysed.
"""

from alembic import op
import sqlalchemy as sa


revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("audio_features", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("perceptual_fingerprint", sa.JSON(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("audio_features", schema=None) as batch_op:
        batch_op.drop_column("perceptual_fingerprint")
