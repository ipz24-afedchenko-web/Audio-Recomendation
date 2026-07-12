from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    source_music_id = Column(Integer, ForeignKey("music.id", ondelete="CASCADE"), nullable=False)
    recommended_music_id = Column(Integer, ForeignKey("music.id", ondelete="CASCADE"), nullable=False)
    similarity_score = Column(Float, nullable=False)  # 0.0 - 1.0
    algorithm = Column(Integer, default=1)  # 1=cosine, 2=euclidean, 3=kmeans
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="recommendations")
    source_music = relationship(
        "Music",
        foreign_keys=[source_music_id],
        back_populates="recommendations_from"
    )
    recommended_music = relationship(
        "Music",
        foreign_keys=[recommended_music_id],
        back_populates="recommendations_to"
    )

    __table_args__ = (
        Index("ix_recommendations_source", "source_music_id"),
        Index("ix_recommendations_recommended", "recommended_music_id"),
    )

    def __repr__(self):
        return f"<Recommendation(id={self.id}, source={self.source_music_id}, recommended={self.recommended_music_id}, score={self.similarity_score})>"
