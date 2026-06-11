from pydantic import BaseModel, Field
from typing import Optional, List


# AudioFeatures Schemas
class AudioFeaturesBase(BaseModel):
    tempo: Optional[float] = None
    duration: Optional[float] = None
    key: Optional[int] = Field(None, ge=0, le=11)
    mode: Optional[int] = Field(None, ge=0, le=1)
    loudness: Optional[float] = None
    energy: Optional[float] = Field(None, ge=0.0, le=1.0)
    valence: Optional[float] = Field(None, ge=0.0, le=1.0)
    spectral_centroid_mean: Optional[float] = None
    spectral_centroid_std: Optional[float] = None
    spectral_bandwidth_mean: Optional[float] = None
    spectral_bandwidth_std: Optional[float] = None
    spectral_rolloff_mean: Optional[float] = None
    spectral_rolloff_std: Optional[float] = None
    mfcc_mean: Optional[List[float]] = None
    mfcc_std: Optional[List[float]] = None
    zero_crossing_rate_mean: Optional[float] = None
    zero_crossing_rate_std: Optional[float] = None
    chroma_stft_mean: Optional[List[float]] = None
    chroma_stft_std: Optional[List[float]] = None
    cluster_id: Optional[int] = None


class AudioFeaturesCreate(AudioFeaturesBase):
    music_id: int


class AudioFeaturesResponse(AudioFeaturesBase):
    id: int
    music_id: int

    class Config:
        from_attributes = True
