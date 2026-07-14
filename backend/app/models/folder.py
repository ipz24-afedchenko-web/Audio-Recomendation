from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="folders")
    tracks = relationship(
        "Music",
        back_populates="folder",
        cascade="save-update, merge, refresh-expire",
    )

    __table_args__ = (
        # A user may not have two folders with the same name.  NULL folder
        # names are impossible (name is NOT NULL), so a plain unique index
        # is sufficient here (unlike the music.slug index, which must stay
        # partial to allow many NULL slugs).
        Index("ix_folders_user_name", "user_id", "name", unique=True),
    )

    def __repr__(self):
        return f"<Folder(id={self.id}, name={self.name!r}, user_id={self.user_id})>"
