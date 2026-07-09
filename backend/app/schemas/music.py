from pydantic import BaseModel, Field, computed_field
from typing import Optional, Literal
from datetime import datetime

from app.models.music import (
    ANALYSIS_STATUS_PENDING,
    ANALYSIS_STATUS_ANALYZING,
    ANALYSIS_STATUS_READY,
    ANALYSIS_STATUS_ERROR,
    SOURCE_LOCAL,
    SOURCE_SPOTIFY,
    SOURCE_JAMENDO,
    SOURCE_DEEZER,
)


# Music Schemas
class MusicBase(BaseModel):
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None


class MusicCreate(MusicBase):
    pass


class MusicUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None


AnalysisStatus = Literal["pending", "analyzing", "ready", "error"]
Source = Literal["local", "spotify", "jamendo", "deezer"]


class MusicResponse(MusicBase):
    id: int
    duration: Optional[float] = None

    # Provenance.  ``source='local'`` rows may still expose ``file_path``
    # (only while analysis is pending — the file is deleted afterwards),
    # but catalog rows (spotify) carry external ids + a preview URL.
    source: Source = "local"
    external_id: Optional[str] = None
    external_uri: Optional[str] = None
    preview_url: Optional[str] = None
    stream_url: Optional[str] = None

    file_path: Optional[str] = None
    file_size: Optional[int] = None
    user_id: int
    created_at: datetime

    # Lifecycle tracking.  ``file_hash`` is exposed so the frontend can
    # show "you already uploaded this file" hints if it ever needs to, but
    # it's mostly for debugging (NULL for catalog tracks).
    file_hash: Optional[str] = None
    analysis_status: AnalysisStatus = "pending"
    analysis_error: Optional[str] = None

    class Config:
        from_attributes = True


class MusicWithFeatures(MusicResponse):
    audio_features: Optional["AudioFeaturesResponse"] = None

    class Config:
        from_attributes = True


# --- Spotify integration schemas ---

class SpotifySearchResult(BaseModel):
    spotify_track_id: str
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    duration_ms: Optional[int] = None
    preview_url: Optional[str] = None
    external_uri: Optional[str] = None
    external_url: Optional[str] = None
    image_url: Optional[str] = None


class SpotifyAddRequest(BaseModel):
    spotify_track_id: str
