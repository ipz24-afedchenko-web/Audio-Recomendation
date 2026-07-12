from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PlaylistImportJob(Base):
    __tablename__ = "playlist_import_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    playlist_id = Column(String, nullable=False)
    playlist_name = Column(String, nullable=True)
    status = Column(String(16), nullable=False, default="pending")
    total_tracks = Column(Integer, nullable=True)
    imported_tracks = Column(Integer, nullable=True, default=0)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="playlist_import_jobs")

    def __repr__(self):
        return f"<PlaylistImportJob(id={self.id}, playlist={self.playlist_id}, status={self.status})>"