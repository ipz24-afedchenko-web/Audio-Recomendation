"""Add ARRAY(Float) columns alongside JSON columns for MFCC/chroma

Revision ID: 005
Revises: 004
Create Date: 2026-07-08 20:30:00.000000

Adds:
  - mfcc_mean_arr        ARRAY(Float)   — native array only on PG
  - mfcc_std_arr         ARRAY(Float)
  - chroma_stft_mean_arr ARRAY(Float)
  - chroma_stft_std_arr  ARRAY(Float)

On SQLite the migration is a no-op (ARRAY not supported — the model
reads/writes JSON columns instead).  Tests bypass Alembic entirely so
this is safe.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.add_column("audio_features", sa.Column("mfcc_mean_arr", postgresql.ARRAY(sa.Float()), nullable=True))
    op.add_column("audio_features", sa.Column("mfcc_std_arr", postgresql.ARRAY(sa.Float()), nullable=True))
    op.add_column("audio_features", sa.Column("chroma_stft_mean_arr", postgresql.ARRAY(sa.Float()), nullable=True))
    op.add_column("audio_features", sa.Column("chroma_stft_std_arr", postgresql.ARRAY(sa.Float()), nullable=True))


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.drop_column("audio_features", "chroma_stft_std_arr")
    op.drop_column("audio_features", "chroma_stft_mean_arr")
    op.drop_column("audio_features", "mfcc_std_arr")
    op.drop_column("audio_features", "mfcc_mean_arr")
