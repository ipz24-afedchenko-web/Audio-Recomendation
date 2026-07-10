from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class SpotifyAuth(Base):
    """
    Stores Spotify OAuth tokens per user for the global player feature.

    Each user can have at most one SpotifyAuth row (one-to-one).  The
    ``access_token`` and ``refresh_token`` are encrypted at rest by the
    storage layer; ``expires_at`` is a Unix timestamp (seconds) so we
    know when to refresh.
    """

    __tablename__ = "spotify_auth"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    expires_at = Column(BigInteger, nullable=False)
    scope = Column(String(256), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="spotify_auth")

    def __repr__(self):
        return f"<SpotifyAuth(user_id={self.user_id}, expires_at={self.expires_at})>"
