"""Add PostgreSQL updated_at triggers (W4-5)

Revision ID: 008
Revises: 007

Native BEFORE UPDATE triggers on ``users`` and ``music`` keep
``updated_at`` current even when rows are mutated outside the ORM
(bulk SQL, another service, a manual ``psql`` session).  On SQLite
(the test/dev default) we deliberately skip the raw DDL — the ORM
``onupdate=func.now()`` already maintains the column there, and
PostgreSQL-specific ``CREATE TRIGGER`` / ``plpgsql`` syntax would not
parse on SQLite.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def _is_postgresql() -> bool:
    try:
        return op.get_context().dialect.name == "postgresql"
    except Exception:
        return False


def upgrade() -> None:
    if not _is_postgresql():
        # SQLite path: rely on the ORM ``onupdate`` already present.
        return

    op.execute(
        text(
            """
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = now();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
    )

    for table in ("users", "music"):
        op.execute(
            text(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table};")
        )
        op.execute(
            text(
                f"""
                CREATE TRIGGER trg_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION set_updated_at();
                """
            )
        )


def downgrade() -> None:
    if not _is_postgresql():
        return

    for table in ("users", "music"):
        op.execute(
            text(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table};")
        )
    op.execute(text("DROP FUNCTION IF EXISTS set_updated_at();"))
