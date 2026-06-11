from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.user import User
from app.models.music import Music
from app.models.audio_features import AudioFeatures
from app.schemas.audio_features import AudioFeaturesResponse
from app.utils.auth import get_current_active_user
from app.services.audio_analyzer import AudioAnalyzer

router = APIRouter(prefix="/api/analyze", tags=["analysis"])
logger = logging.getLogger(__name__)


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

    Extracted features include:
    - Temporal: tempo (BPM), duration
    - Tonal: key, mode
    - Energy: loudness (dB), energy
    - Mood: valence (positivity)
    - Spectral: centroid, bandwidth, rolloff
    - Timbre: MFCCs (20 coefficients)
    - Rhythm: zero-crossing rate
    - Harmony: chroma features (12 pitch classes)

    - **music_id**: ID of the music track to analyze

    Returns the extracted audio features.
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

    # Analyze audio file using librosa
    try:
        analyzer = AudioAnalyzer()
        features = analyzer.analyze(music.file_path)

        # Estimate valence
        valence = analyzer.estimate_valence(features)
        if valence is not None:
            features["valence"] = valence

        # Create AudioFeatures record
        audio_features = AudioFeatures(
            music_id=music_id,
            tempo=features.get("tempo"),
            duration=features.get("duration"),
            key=features.get("key"),
            mode=features.get("mode"),
            loudness=features.get("loudness"),
            energy=features.get("energy"),
            valence=features.get("valence"),
            spectral_centroid_mean=features.get("spectral_centroid_mean"),
            spectral_centroid_std=features.get("spectral_centroid_std"),
            spectral_bandwidth_mean=features.get("spectral_bandwidth_mean"),
            spectral_bandwidth_std=features.get("spectral_bandwidth_std"),
            spectral_rolloff_mean=features.get("spectral_rolloff_mean"),
            spectral_rolloff_std=features.get("spectral_rolloff_std"),
            mfcc_mean=features.get("mfcc_mean"),
            mfcc_std=features.get("mfcc_std"),
            zero_crossing_rate_mean=features.get("zero_crossing_rate_mean"),
            zero_crossing_rate_std=features.get("zero_crossing_rate_std"),
            chroma_stft_mean=features.get("chroma_stft_mean"),
            chroma_stft_std=features.get("chroma_stft_std"),
        )

        # Update music duration if not set
        if music.duration is None and features.get("duration"):
            music.duration = features["duration"]

        db.add(audio_features)
        db.commit()
        db.refresh(audio_features)

        logger.info(f"Successfully analyzed music track {music_id}")
        return audio_features

    except Exception as e:
        logger.error(f"Error analyzing music {music_id}: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze audio file: {str(e)}"
        )


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
