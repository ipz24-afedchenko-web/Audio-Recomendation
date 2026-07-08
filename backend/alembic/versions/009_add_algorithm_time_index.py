"""Add index on algorithm_events(algorithm, created_at) for time-range queries (W4-8)

Revision ID: 009
Revises: 008
Create Date: 2026-07-08 22:00:00.000000

Optimises queries that filter by algorithm and range-sort by time, such
as A/B stats aggregation over rolling windows and future time-partitioned
querying.

The index is a plain composite B-tree on (algorithm, created_at) and is
safe on both PostgreSQL and SQLite.
"""

from alembic import op


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_ab_algorithm_time",
        "algorithm_events",
        ["algorithm", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ab_algorithm_time", table_name="algorithm_events")
