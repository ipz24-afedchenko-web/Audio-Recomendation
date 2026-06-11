"""
Recommendation API Routes

Endpoints:
- GET  /api/recommend/{music_id}  — get recommendations for a track
- GET  /api/recommend/user/{user_id}  — get user's recommendation history
- POST /api/recommend/train  — trigger model retraining
- GET  /api/recommend/clusters  — view cluster distribution
- POST /api/recommend/predict-genre/{music_id}  — predict genre for a track
- POST /api/recommend/train-genre  — train genre classifier
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.user import User
from app.models.music import Music
from app.models.audio_features import AudioFeatures
from app.models.recommendation import Recommendation
from app.schemas.recommendation import RecommendationResponse, RecommendationWithMusic
from app.utils.auth import get_current_active_user
from app.services.ml_recommender import MLRecommender
from app.services.genre_classifier import GenreClassifier

router = APIRouter(prefix="/api/recommend", tags=["recommendations"])
logger = logging.getLogger(__name__)


@router.get("/{music_id}", response_model=List[RecommendationWithMusic])
async def get_recommendations(
    music_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    algorithm: int = Query(default=3, ge=1, le=3, description="1=cosine, 2=euclidean, 3=cluster-aware"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get music recommendations based on a source track.

    Uses ML algorithms to find similar tracks based on audio features.

    - **music_id**: ID of the source music track
    - **limit**: Maximum number of recommendations (1-50, default 10)
    - **algorithm**: Recommendation algorithm (1=cosine, 2=euclidean, 3=cluster-aware cosine)

    Returns list of recommended tracks with similarity scores.
    """
    # Validate source music exists
    source_music = db.query(Music).filter(Music.id == music_id).first()
    if not source_music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source music not found"
        )

    # Verify audio features exist
    source_features = db.query(AudioFeatures).filter(
        AudioFeatures.music_id == music_id
    ).first()

    if not source_features:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source music not analyzed. Run analysis first via POST /api/analyze/{music_id}."
        )

    # Clear previous recommendations for this source (avoid duplicates)
    db.query(Recommendation).filter(
        Recommendation.source_music_id == music_id,
        Recommendation.user_id == current_user.id,
    ).delete()
    db.flush()

    # Generate recommendations using MLRecommender
    recommender = MLRecommender()
    recommender.load_models()

    results = recommender.get_recommendations(
        music_id=music_id,
        db=db,
        user_id=current_user.id,
        limit=limit,
        algorithm=algorithm,
    )

    if not results:
        return []

    # Build response with music metadata
    response = []
    for rec_data in results:
        # Fetch the saved Recommendation record
        rec = db.query(Recommendation).filter(
            Recommendation.source_music_id == music_id,
            Recommendation.recommended_music_id == rec_data["recommended_music_id"],
            Recommendation.user_id == current_user.id,
        ).order_by(Recommendation.created_at.desc()).first()

        if rec and rec_data["recommended_music"]:
            rec_dict = {
                "id": rec.id,
                "user_id": rec.user_id,
                "source_music_id": rec.source_music_id,
                "recommended_music_id": rec.recommended_music_id,
                "similarity_score": rec.similarity_score,
                "algorithm": rec.algorithm,
                "created_at": rec.created_at,
                "recommended_music": rec_data["recommended_music"],
            }
            response.append(rec_dict)

    return response


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


@router.post("/train")
async def train_models(
    n_clusters: int = Query(default=8, ge=2, le=50, description="Number of K-means clusters"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Train/retrain the K-Means clustering model.

    This endpoint fits K-Means on all analyzed tracks, assigns cluster IDs,
    and persists the model to disk.

    - **n_clusters**: Number of clusters (2-50, default 8)

    Returns training statistics including inertia and cluster distribution.
    """
    try:
        recommender = MLRecommender(n_clusters=n_clusters)
        result = recommender.fit_clusters(db)

        if result["status"] == "error":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["message"]
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error training models: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model training failed: {str(e)}"
        )


@router.get("/clusters", response_model=None)
async def get_clusters(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get cluster distribution statistics.

    Returns information about how tracks are distributed across clusters.
    Requires that the K-Means model has been trained first.
    """
    recommender = MLRecommender()
    return recommender.get_cluster_info(db)


@router.post("/train-genre")
async def train_genre_classifier(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Train the genre classifier on labelled tracks.

    Requires at least 5 tracks with genre labels in the database.

    Returns training metrics including accuracy and classification report.
    """
    try:
        classifier = GenreClassifier()
        result = classifier.train(db)

        if result["status"] == "error":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["message"]
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error training genre classifier: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Genre classifier training failed: {str(e)}"
        )


@router.post("/predict-genre/{music_id}")
async def predict_genre(
    music_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Predict genre for a specific track.

    Requires that the genre classifier has been trained first.

    - **music_id**: ID of the music track

    Returns predicted genre with confidence score and probability distribution.
    """
    # Validate music exists
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music not found"
        )

    # Validate audio features exist
    features = db.query(AudioFeatures).filter(
        AudioFeatures.music_id == music_id
    ).first()
    if not features:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Music not analyzed. Run analysis first."
        )

    classifier = GenreClassifier()
    result = classifier.predict(db, music_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Genre classifier not trained or prediction failed. Train classifier first via POST /api/recommend/train-genre."
        )

    return result
