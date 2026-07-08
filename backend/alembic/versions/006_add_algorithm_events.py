"""Add algorithm_events table for A/B testing

Revision ID: 006
Revises: 005
Create Date: 2026-07-08 22:00:00.000000

Adds:
  - algorithm_events table tracking impressions, clicks, and plays
    per (user, algorithm, recommended_track) interaction.
"""

from alembic import op
import sqlalchemy as sa


revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "algorithm_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("algorithm", sa.Integer(), nullable=False),
        sa.Column("source_music_id", sa.Integer(), sa.ForeignKey("music.id"), nullable=False),
        sa.Column("recommended_music_id", sa.Integer(), sa.ForeignKey("music.id"), nullable=True),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_algorithm_events_id"), "algorithm_events", ["id"], unique=False)
    op.create_index("ix_ab_algorithm_event_type", "algorithm_events", ["algorithm", "event_type"])
    op.create_index("ix_ab_user_created", "algorithm_events", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_ab_user_created", table_name="algorithm_events")
    op.drop_index("ix_ab_algorithm_event_type", table_name="algorithm_events")
    op.drop_index(op.f("ix_algorithm_events_id"), table_name="algorithm_events")
    op.drop_table("algorithm_events")
