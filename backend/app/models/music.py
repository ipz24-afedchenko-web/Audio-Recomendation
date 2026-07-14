from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


# Lifecycle values for ``Music.analysis_status``.  Mirror these in
# ``app/schemas/music.py`` so the API surface stays in sync.
ANALYSIS_STATUS_PENDING = "pending"
ANALYSIS_STATUS_ANALYZING = "analyzing"
ANALYSIS_STATUS_READY = "ready"
ANALYSIS_STATUS_ERROR = "error"
ANALYSIS_STATUSES = frozenset({
    ANALYSIS_STATUS_PENDING,
    ANALYSIS_STATUS_ANALYZING,
    ANALYSIS_STATUS_READY,
    ANALYSIS_STATUS_ERROR,
})

# Where a track originated.  ``local`` = user upload analyzed by librosa
# and deleted after analysis; ``spotify`` = free-tier catalog track whose
# features come from the Spotify Web API (no file stored).  Jamendo/Deezer
# are reserved for a possible future royalty-free source.
SOURCE_LOCAL = "local"
SOURCE_SPOTIFY = "spotify"
SOURCE_JAMENDO = "jamendo"
SOURCE_DEEZER = "deezer"
SOURCES = frozenset({SOURCE_LOCAL, SOURCE_SPOTIFY, SOURCE_JAMENDO, SOURCE_DEEZER})


class Music(Base):
    __tablename__ = "music"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    artist = Column(String, nullable=True)
    album = Column(String, nullable=True)
    genre = Column(String, nullable=True, index=True)
    duration = Column(Float, nullable=True)  # in seconds

    # Provenance.  Distinguishes user-uploaded tracks (analyzed in-RAM by
    # librosa, file deleted) from external-catalog tracks (Spotify etc.).
    source = Column(String(16), nullable=False, server_default=SOURCE_LOCAL)

    # External catalog identifiers (NULL for ``source='local'``).
    external_id = Column(String(128), nullable=True)   # Spotify track id
    external_uri = Column(String(256), nullable=True)   # spotify:track:xxxx
    preview_url = Column(String(512), nullable=True)    # 30s iframe src
    stream_url = Column(String(512), nullable=True)    # direct audio (future)
    cover_url = Column(String(512), nullable=True)    # album/cover art URL

    # Local-upload storage.  Nullable: external-catalog rows never hold a
    # file.  For ``source='local'`` this is only meaningful while analysis
    # is pending (file is deleted afterwards).
    file_path = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)  # in bytes

    # SHA-256 hex digest of the uploaded bytes.  Used for per-user dedup of
    # local uploads only (NULL for external-catalog rows).
    file_hash = Column(String(64), nullable=True)

    # Tracks the analysis BackgroundTask.  See ANALYSIS_STATUSES above.
    analysis_status = Column(
        String(16), nullable=False, server_default="pending"
    )
    analysis_error = Column(Text, nullable=True)

    # Library organisation.  ``folder_id`` groups a user's tracks into
    # user-created folders; NULL means "Uncategorized".  Deleting a folder
    # SETs this to NULL rather than cascading the track (the file + features
    # are preserved).
    folder_id = Column(
        Integer, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True
    )

    # URL-friendly identifier derived from artist + title.  Powers
    # slug-based routing (``/analyze/:slug``) so links are human-readable
    # and stable per-user.  NULL only for legacy rows; new tracks always
    # get one.  The partial unique index below blocks duplicate slugs for
    # the same user while still allowing many NULLs.
    slug = Column(String(255), nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    owner = relationship("User", back_populates="music")
    folder = relationship("Folder", back_populates="tracks")
    audio_features = relationship(
        "AudioFeatures",
        back_populates="music",
        uselist=False,
        cascade="all, delete-orphan",
    )
    recommendations_from = relationship(
        "Recommendation",
        foreign_keys="Recommendation.source_music_id",
        back_populates="source_music",
        cascade="all, delete-orphan",
    )
    recommendations_to = relationship(
        "Recommendation",
        foreign_keys="Recommendation.recommended_music_id",
        back_populates="recommended_music",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        # Partial *unique* indexes enforce dedup without a separate
        # constraint object (UniqueConstraint does not accept sqlite_where
        # in SQLAlchemy 2.0).  Postgres honours ``postgresql_where`` and
        # SQLite honours ``sqlite_where``; both create a partial unique
        # index that blocks the relevant duplicates only.
        Index(
            "ix_music_user_hash", "user_id", "file_hash", unique=True,
            sqlite_where=(source == SOURCE_LOCAL),
            postgresql_where=(source == SOURCE_LOCAL),
        ),
        Index(
            "ix_music_user_external", "user_id", "external_id", unique=True,
            sqlite_where=(source != SOURCE_LOCAL),
            postgresql_where=(source != SOURCE_LOCAL),
        ),
        # Partial unique index on (user_id, slug): only non-NULL slugs are
        # indexed, so a user may have many uncategorized (NULL-slug) tracks
        # but never two tracks sharing the same slug.  Mirrors the
        # postgresql_where / sqlite_where dual syntax used above.
        Index(
            "ix_music_user_slug", "user_id", "slug", unique=True,
            sqlite_where=slug.isnot(None),
            postgresql_where=slug.isnot(None),
        ),
        Index("ix_music_source", "source"),
        Index("ix_music_folder", "folder_id"),
    )

    def __repr__(self):
        return (
            f"<Music(id={self.id}, title={self.title}, "
            f"artist={self.artist}, status={self.analysis_status})>"
        )
