from app.schemas.user import UserBase, UserCreate, UserLogin, UserResponse, Token, TokenData
from app.schemas.music import MusicBase, MusicCreate, MusicUpdate, MusicResponse, MusicWithFeatures
from app.schemas.audio_features import AudioFeaturesBase, AudioFeaturesCreate, AudioFeaturesResponse
from app.schemas.recommendation import (
    RecommendationBase,
    RecommendationCreate,
    RecommendationResponse,
    RecommendationWithMusic
)

__all__ = [
    "UserBase", "UserCreate", "UserLogin", "UserResponse", "Token", "TokenData",
    "MusicBase", "MusicCreate", "MusicUpdate", "MusicResponse", "MusicWithFeatures",
    "AudioFeaturesBase", "AudioFeaturesCreate", "AudioFeaturesResponse",
    "RecommendationBase", "RecommendationCreate", "RecommendationResponse", "RecommendationWithMusic"
]
