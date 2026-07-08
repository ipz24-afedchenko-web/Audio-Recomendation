"""Add ab_config table for the promoted default algorithm (W4-2)

Revision ID: 007
Revises: 006
"""

from alembic import op
import sqlalchemy as sa

from app.database import Base  # noqa: F401  (ensures metadata import order)
from app.models.ab_config import ABConfig  # noqa: F401


revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ab_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("default_algorithm", sa.Integer(), nullable=False, server_default="3"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ab_config")
