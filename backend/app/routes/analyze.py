from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.music import Music
from app.models.audio_features import AudioFeatures
from app.schemas.audio_features import AudioFeaturesResponse
from app.utils.auth import get_current_active_user

router = APIRouter(prefix="/api/analyze", tags=["analysis"])


@router.post("/{music_id}", response_model=AudioFeaturesResponse)
async def analyze_music(
    music_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Analyze a music track and extract audio features.

    This endpoint triggers audio analysis using librosa and stores
    the extracted features in the database.

    - **music_id**: ID of the music track to analyze

    Returns the extracted audio features.

    Note: Audio analysis implementation will be added in STEP 4.
    Currently returns a placeholder response.
    """
    # Get music record
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music not found"
        )

    # Check ownership
    if music.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to analyze this music"
        )

    # Check if features already exist
    existing_features = db.query(AudioFeatures).filter(
        AudioFeatures.music_id == music_id
    ).first()

    if existing_features:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Music already analyzed. Use GET endpoint to retrieve features."
        )

    # TODO: In STEP 4, implement actual audio analysis here using librosa
    # For now, create placeholder features
    audio_features = AudioFeatures(
        music_id=music_id,
        tempo=120.0,  # Placeholder
        duration=music.duration,
        energy=0.5,
        valence=0.5
    )

    db.add(audio_features)
    db.commit()
    db.refresh(audio_features)

    return audio_features


@router.get("/features/{music_id}", response_model=AudioFeaturesResponse)
def get_audio_features(
    music_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get audio features for a music track.

    - **music_id**: ID of the music track

    Returns audio features if the track has been analyzed.
    """
    # Get music record
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music not found"
        )

    # Check ownership
    if music.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this music's features"
        )

    # Get features
    features = db.query(AudioFeatures).filter(
        AudioFeatures.music_id == music_id
    ).first()

    if not features:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio features not found. Run analysis first."
        )

    return features
