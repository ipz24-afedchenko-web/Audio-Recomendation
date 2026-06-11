from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


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


class MusicResponse(MusicBase):
    id: int
    duration: Optional[float] = None
    file_path: str
    file_size: Optional[int] = None
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class MusicWithFeatures(MusicResponse):
    audio_features: Optional["AudioFeaturesResponse"] = None

    class Config:
        from_attributes = True
