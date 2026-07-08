"""Add ON DELETE CASCADE and recommendation indices

Revision ID: 004
Revises: 003
Create Date: 2026-07-08 20:00:00.000000

Changes:
1. audio_features.music_id FK → ON DELETE CASCADE (DB-level consistency
   with the ORM cascade already set on the Music.audio_features relation)
2. New indices on recommendations.source_music_id and
   recommendations.recommended_music_id — both used in every recommend
   query (the N+1 fix already batch-loads Music, but index scans are
   cheaper than seq scans over potentially millions of rows).

NOTE: PostgreSQL and SQLite need different approaches for FK changes.
batch_alter_table is only safe for SQLite.  PostgreSQL gets direct
ALTER TABLE statements so we don't fight with auto-generated constraint
names or batch-mode CTAS (CREATE TABLE AS SELECT) overhead.
"""

from alembic import op
import sqlalchemy as sa


revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # --- 1. ON DELETE CASCADE on audio_features.music_id ----------------
    if _is_postgresql():
        # PG auto-generates constraint names like audio_features_music_id_fkey;
        # try both the explicit name and the PG default.
        op.execute(
            "ALTER TABLE audio_features DROP CONSTRAINT IF EXISTS "
            "fk_audio_features_music_id_music"
        )
        op.execute(
            "ALTER TABLE audio_features DROP CONSTRAINT IF EXISTS "
            "audio_features_music_id_fkey"
        )
        op.create_foreign_key(
            "fk_audio_features_music_id_music",
            "audio_features",
            "music",
            ["music_id"],
            ["id"],
            ondelete="CASCADE",
        )
    else:
        with op.batch_alter_table("audio_features") as batch_op:
            batch_op.drop_constraint(
                "fk_audio_features_music_id_music", type_="foreignkey"
            )
            batch_op.create_foreign_key(
                "fk_audio_features_music_id_music",
                "music",
                ["music_id"],
                ["id"],
                ondelete="CASCADE",
            )

    # --- 2. Indices on recommendations columns -------------------------
    if _is_postgresql():
        op.create_index(
            "ix_recommendations_source",
            "recommendations",
            ["source_music_id"],
        )
        op.create_index(
            "ix_recommendations_recommended",
            "recommendations",
            ["recommended_music_id"],
        )
    else:
        with op.batch_alter_table("recommendations") as batch_op:
            batch_op.create_index(
                "ix_recommendations_source", ["source_music_id"]
            )
            batch_op.create_index(
                "ix_recommendations_recommended", ["recommended_music_id"]
            )


def downgrade() -> None:
    if _is_postgresql():
        op.drop_index("ix_recommendations_recommended")
        op.drop_index("ix_recommendations_source")
        op.execute(
            "ALTER TABLE audio_features DROP CONSTRAINT IF EXISTS "
            "fk_audio_features_music_id_music"
        )
        op.create_foreign_key(
            "fk_audio_features_music_id_music",
            "audio_features",
            "music",
            ["music_id"],
            ["id"],
        )
    else:
        with op.batch_alter_table("recommendations") as batch_op:
            batch_op.drop_index("ix_recommendations_recommended")
            batch_op.drop_index("ix_recommendations_source")
        with op.batch_alter_table("audio_features") as batch_op:
            batch_op.drop_constraint(
                "fk_audio_features_music_id_music", type_="foreignkey"
            )
            batch_op.create_foreign_key(
                "fk_audio_features_music_id_music",
                "music",
                ["music_id"],
                ["id"],
            )
