"""Hybrid source model: Spotify + in-memory local analysis (MVP)

Revision ID: 010
Revises: 009
Create Date: 2026-07-09 12:00:00.000000

Introduces track provenance so the app no longer depends on storing heavy
audio files (free-hosting friendly):

- ``music.source``: 'local' (user upload, analyzed in-RAM then deleted)
  or 'spotify' (catalog track, features from the Spotify Web API).
- ``music.external_id`` / ``external_uri`` / ``preview_url`` /
  ``stream_url``: external-catalog identifiers and playback URLs.
- ``music.file_path`` becomes nullable (catalog rows never hold a file).
- Two *partial* unique indexes replace the old full-table one:
    * one local upload per user per content hash (``source='local'``)
    * one catalog track per user per ``external_id`` (``source<>'local'``)
  Both Postgres and SQLite (2.0.32+) support ``WHERE`` on indexes.
- ``audio_features.feature_origin``: 'librosa' | 'spotify' — drives the
  hybrid recommender.

The legacy non-partial ``ix_music_user_hash`` / ``uq_music_user_hash`` from
migration 002 are dropped and recreated as partial indexes.
"""

from alembic import op
import sqlalchemy as sa


revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # --- audio_features.feature_origin ---
    with op.batch_alter_table("audio_features", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "feature_origin",
                sa.String(length=8),
                nullable=False,
                server_default="librosa",
            )
        )

    # --- music: provenance columns + relax file_path ---
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "source",
                sa.String(length=16),
                nullable=False,
                server_default="local",
            )
        )
        batch_op.add_column(
            sa.Column("external_id", sa.String(length=128), nullable=True)
        )
        batch_op.add_column(
            sa.Column("external_uri", sa.String(length=256), nullable=True)
        )
        batch_op.add_column(
            sa.Column("preview_url", sa.String(length=512), nullable=True)
        )
        batch_op.add_column(
            sa.Column("stream_url", sa.String(length=512), nullable=True)
        )
        # file_path was NOT NULL in 001; make it nullable.
        if is_sqlite:
            # SQLite ignores server_default/NOT NULL alter nuances; the
            # batch operation rebuilds the table and drops the constraint.
            batch_op.alter_column(
                "file_path",
                existing_type=sa.String(),
                nullable=True,
            )
        else:
            batch_op.alter_column(
                "file_path",
                existing_type=sa.String(),
                nullable=True,
                existing_nullable=False,
            )
        # Drop the legacy full-table unique index.
        batch_op.drop_index("ix_music_user_hash")

        # Recreate as partial unique indexes.
        where_local = "source = 'local'"
        where_external = "source <> 'local'"
        if is_sqlite:
            batch_op.create_index(
                "ix_music_user_hash",
                ["user_id", "file_hash"],
                unique=True,
                sqlite_where=sa.text(where_local),
            )
            batch_op.create_index(
                "ix_music_user_external",
                ["user_id", "external_id"],
                unique=True,
                sqlite_where=sa.text(where_external),
            )
            batch_op.create_index("ix_music_source", ["source"], unique=False)
        else:
            batch_op.create_index(
                "ix_music_user_hash",
                ["user_id", "file_hash"],
                unique=True,
                postgresql_where=sa.text(where_local),
            )
            batch_op.create_index(
                "ix_music_user_external",
                ["user_id", "external_id"],
                unique=True,
                postgresql_where=sa.text(where_external),
            )
            batch_op.create_index("ix_music_source", ["source"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.drop_index("ix_music_source")
        batch_op.drop_index("ix_music_user_external")
        batch_op.drop_index("ix_music_user_hash")
        batch_op.alter_column(
            "file_path",
            existing_type=sa.String(),
            nullable=False,
        )
        batch_op.drop_column("stream_url")
        batch_op.drop_column("preview_url")
        batch_op.drop_column("external_uri")
        batch_op.drop_column("external_id")
        batch_op.drop_column("source")

    with op.batch_alter_table("audio_features", schema=None) as batch_op:
        batch_op.drop_column("feature_origin")

    # Restore the legacy full-table unique index dropped in upgrade().
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.create_index(
            "ix_music_user_hash", ["user_id", "file_hash"], unique=True
        )
