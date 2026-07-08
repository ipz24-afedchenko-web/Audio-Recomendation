from datetime import datetime

from pydantic import BaseModel, Field


class AlgorithmEventCreate(BaseModel):
    algorithm: int = Field(..., ge=1, le=3)
    source_music_id: int
    recommended_music_id: int | None = None
    event_type: str = Field(..., pattern=r"^(impression|click|play)$")


class AlgorithmEventResponse(BaseModel):
    id: int
    user_id: int
    algorithm: int
    source_music_id: int
    recommended_music_id: int | None = None
    event_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class ABStatsRow(BaseModel):
    algorithm: int
    impressions: int = 0
    clicks: int = 0
    plays: int = 0
    ctr: float = 0.0
    z_score: float | None = None
    p_value: float | None = None
    significant: bool = False


class ABStatsResponse(BaseModel):
    total_events: int
    rows: list[ABStatsRow]
    best_algorithm: int | None = None
    winner_significant: bool = False
    default_algorithm: int = 3
