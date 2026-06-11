from pydantic import BaseModel, Field
from datetime import datetime


# Recommendation Schemas
class RecommendationBase(BaseModel):
    source_music_id: int
    recommended_music_id: int
    similarity_score: float = Field(..., ge=0.0, le=1.0)
    algorithm: int = Field(default=1, ge=1, le=3)


class RecommendationCreate(RecommendationBase):
    user_id: int


class RecommendationResponse(RecommendationBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RecommendationWithMusic(RecommendationResponse):
    recommended_music: "MusicResponse"

    class Config:
        from_attributes = True


# Import for forward references
from app.schemas.music import MusicResponse
from app.schemas.audio_features import AudioFeaturesResponse

# Update forward references
RecommendationWithMusic.model_rebuild()
