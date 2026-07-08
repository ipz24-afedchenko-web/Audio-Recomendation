from pydantic import BaseModel, Field, computed_field
from typing import Optional, Literal
from datetime import datetime

from app.models.music import (
    ANALYSIS_STATUS_PENDING,
    ANALYSIS_STATUS_ANALYZING,
    ANALYSIS_STATUS_READY,
    ANALYSIS_STATUS_ERROR,
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


class MusicResponse(MusicBase):
    id: int
    duration: Optional[float] = None
    file_path: str
    file_size: Optional[int] = None
    user_id: int
    created_at: datetime

    # New in v1.2 — lifecycle tracking.  ``file_hash`` is exposed so the
    # frontend can show "you already uploaded this file" hints if it
    # ever needs to, but it's mostly for debugging.
    file_hash: Optional[str] = None
    analysis_status: AnalysisStatus = "pending"
    analysis_error: Optional[str] = None

    class Config:
        from_attributes = True


class MusicWithFeatures(MusicResponse):
    audio_features: Optional["AudioFeaturesResponse"] = None

    class Config:
        from_attributes = True
