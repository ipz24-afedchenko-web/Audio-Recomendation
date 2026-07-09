"""Add playlist_import_jobs table for Spotify playlist import tracking

Revision ID: 012
Revises: 011
Create Date: 2026-07-09 18:00:00.000000

Tracks the progress of importing Spotify playlists: which user started
the import, which playlist, how many tracks were found vs. imported,
and the current status (pending / running / done / error).
"""

from alembic import op
import sqlalchemy as sa


revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "playlist_import_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("playlist_id", sa.String(), nullable=False),
        sa.Column("playlist_name", sa.String(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("total_tracks", sa.Integer(), nullable=True),
        sa.Column("imported_tracks", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            onupdate=sa.func.now(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_playlist_import_jobs_user_id"),
        "playlist_import_jobs",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_playlist_import_jobs_user_id"), table_name="playlist_import_jobs")
    op.drop_table("playlist_import_jobs")
