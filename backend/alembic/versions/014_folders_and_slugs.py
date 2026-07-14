"""Add folders + per-user track slugs

Revision ID: 014
Revises: 013
Create Date: 2026-07-12 14:00:00.000000

Introduces user-owned library folders and human-readable, per-user-unique
track slugs used for shareable links (``/analyze/<slug>``).

Schema changes
--------------
- New ``folders`` table (id, name, user_id FK -> users.id ON DELETE CASCADE,
  created_at) with a unique (user_id, name) index.
- ``music.folder_id`` FK -> folders.id ON DELETE SET NULL (NULL = the
  "Uncategorized" pseudo-folder).
- ``music.slug`` String(255), nullable.  A partial *unique* index on
  (user_id, slug) blocks duplicate slugs per user while still permitting
  many NULL slugs (legacy / uncategorized tracks).
- Plain index on ``music.folder_id`` for fast folder listings.
"""
from alembic import op
import sqlalchemy as sa


revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- folders table -------------------------------------------------
    op.create_table(
        "folders",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_folders_user_name", "folders", ["user_id", "name"], unique=True
    )

    # --- music: folder_id + slug ---------------------------------------
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("folder_id", sa.Integer(), nullable=True)
        )
        batch_op.add_column(sa.Column("slug", sa.String(length=255), nullable=True))
        batch_op.create_foreign_key(
            "fk_music_folder_id",
            "folders",
            ["folder_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_music_folder", ["folder_id"])

    # Partial unique index on (user_id, slug): only non-NULL slugs are
    # indexed, so a user may own many uncategorized (NULL-slug) tracks but
    # never two sharing the same slug.
    op.create_index(
        "ix_music_user_slug",
        "music",
        ["user_id", "slug"],
        unique=True,
        sqlite_where=sa.text("slug IS NOT NULL"),
        postgresql_where=sa.text("slug IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_music_user_slug",
        table_name="music",
        sqlite_where=sa.text("slug IS NOT NULL"),
        postgresql_where=sa.text("slug IS NOT NULL"),
    )

    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.drop_index("ix_music_folder")
        batch_op.drop_constraint("fk_music_folder_id", type_="foreignkey")
        batch_op.drop_column("slug")
        batch_op.drop_column("folder_id")

    op.drop_index("ix_folders_user_name", table_name="folders")
    op.drop_table("folders")
