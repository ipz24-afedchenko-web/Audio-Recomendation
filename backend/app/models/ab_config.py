from sqlalchemy import Column, Integer

from app.database import Base


class ABConfig(Base):
    """
    Single-row table holding A/B test configuration.

    The only field of interest today is ``default_algorithm`` — the
    recommendation algorithm that should be used for normal (non A/B)
    requests once a winning variant has been promoted (W4-2).  Using a
    row instead of a flat config file keeps it in the same Alembic-owned
    schema as the rest of the app and lets it be updated at runtime.
    """

    __tablename__ = "ab_config"

    id = Column(Integer, primary_key=True)
    default_algorithm = Column(Integer, nullable=False, default=3)

    @classmethod
    def _singleton(cls, db) -> "ABConfig":
        """Return the single config row, creating it on first use."""
        row = db.query(cls).first()
        if row is None:
            row = cls(default_algorithm=3)
            db.add(row)
            db.commit()
            db.refresh(row)
        return row
