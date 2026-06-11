from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.music import Music
from app.models.audio_features import AudioFeatures
from app.models.recommendation import Recommendation
from app.schemas.recommendation import RecommendationResponse, RecommendationWithMusic
from app.utils.auth import get_current_active_user

router = APIRouter(prefix="/api/recommend", tags=["recommendations"])


@router.get("/{music_id}", response_model=List[RecommendationWithMusic])
async def get_recommendations(
    music_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get music recommendations based on a source track.

    This endpoint uses ML algorithms to find similar tracks based on
    audio features (cosine similarity, K-means clustering).

    - **music_id**: ID of the source music track
    - **limit**: Maximum number of recommendations (1-50, default 10)

    Returns list of recommended tracks with similarity scores.

    Note: ML recommendation implementation will be added in STEP 5.
    Currently returns a placeholder response.
    """
    # Get source music
    source_music = db.query(Music).filter(Music.id == music_id).first()
    if not source_music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source music not found"
        )

    # Check if music has been analyzed
    source_features = db.query(AudioFeatures).filter(
        AudioFeatures.music_id == music_id
    ).first()

    if not source_features:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source music not analyzed. Run analysis first."
        )

    # TODO: In STEP 5, implement actual ML recommendation logic here
    # For now, return existing recommendations from database
    recommendations = db.query(Recommendation)\
        .filter(Recommendation.source_music_id == music_id)\
        .order_by(Recommendation.similarity_score.desc())\
        .limit(limit)\
        .all()

    # If no recommendations exist, return empty list
    if not recommendations:
        return []

    # Join with music data
    result = []
    for rec in recommendations:
        recommended_music = db.query(Music).filter(
            Music.id == rec.recommended_music_id
        ).first()

        if recommended_music:
            rec_dict = {
                "id": rec.id,
                "user_id": rec.user_id,
                "source_music_id": rec.source_music_id,
                "recommended_music_id": rec.recommended_music_id,
                "similarity_score": rec.similarity_score,
                "algorithm": rec.algorithm,
                "created_at": rec.created_at,
                "recommended_music": recommended_music
            }
            result.append(rec_dict)

    return result


@router.get("/user/{user_id}", response_model=List[RecommendationResponse])
def get_user_recommendations(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all recommendations for a specific user.

    - **user_id**: User ID
    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return

    Returns list of all recommendations made for this user.
    """
    # Users can only see their own recommendations unless they're superuser
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this user's recommendations"
        )

    recommendations = db.query(Recommendation)\
        .filter(Recommendation.user_id == user_id)\
        .order_by(Recommendation.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()

    return recommendations
