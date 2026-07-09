"""Add spotify_auth table for OAuth token storage (global player)

Revision ID: 011
Revises: 010
Create Date: 2026-07-09 12:00:00.000000

Adds the ``spotify_auth`` table that holds per-user Spotify OAuth
tokens (access + refresh) for the global player feature.  The FK to
``users.id`` uses ON DELETE CASCADE; the ``user_id`` column is unique
so each user can have at most one token row.
"""

from alembic import op
import sqlalchemy as sa


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "spotify_auth",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("access_token", sa.String(), nullable=False),
        sa.Column("refresh_token", sa.String(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("scope", sa.String(256), nullable=True),
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
        op.f("ix_spotify_auth_user_id"),
        "spotify_auth",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_spotify_auth_user_id"), table_name="spotify_auth")
    op.drop_table("spotify_auth")
