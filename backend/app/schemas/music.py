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
    # Optional folder placement.  NULL (default) means "Uncategorized".
    folder_id: Optional[int] = None


class MusicUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    folder_id: Optional[int] = None


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
    cover_url: Optional[str] = None

    file_path: Optional[str] = None
    file_size: Optional[int] = None
    user_id: int
    folder_id: Optional[int] = None
    slug: Optional[str] = None
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
    folder_id: Optional[int] = None


class SpotifyPlaylistRequest(BaseModel):
    """Request body for POST /api/spotify/playlist.

    Accepts either a full Spotify playlist URL or a bare playlist ID.
    """
    playlist_url: str
    folder_id: Optional[int] = None
    max_tracks: int = 2000  # capped server-side at 2000


class SpotifyPlaylistTrackResult(BaseModel):
    """Per-track outcome in a playlist import response."""
    spotify_track_id: str
    title: str
    artist: Optional[str] = None
    status: str   # 'added' | 'duplicate' | 'error'
    music_id: Optional[int] = None
    error: Optional[str] = None


class SpotifyPlaylistImportResult(BaseModel):
    """Summary returned by POST /api/spotify/playlist."""
    playlist_name: str
    playlist_image: Optional[str] = None
    total_in_playlist: int
    added: int
    duplicates: int
    errors: int
    tracks: list[SpotifyPlaylistTrackResult]


class SpotifyPlayRequest(BaseModel):
    device_id: Optional[str] = None
    uri: Optional[str] = None
