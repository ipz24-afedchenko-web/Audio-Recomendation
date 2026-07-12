from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class AlgorithmEvent(Base):
    __tablename__ = "algorithm_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    algorithm = Column(Integer, nullable=False)
    source_music_id = Column(Integer, ForeignKey("music.id", ondelete="CASCADE"), nullable=False)
    recommended_music_id = Column(Integer, ForeignKey("music.id", ondelete="CASCADE"), nullable=True)
    event_type = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_ab_algorithm_event_type", "algorithm", "event_type"),
        Index("ix_ab_user_created", "user_id", "created_at"),
        Index("ix_ab_algorithm_time", "algorithm", "created_at"),
    )
