from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.user import User
from app.models.music import Music, SOURCE_SPOTIFY
from app.models.audio_features import AudioFeatures
from app.schemas.audio_features import AudioFeaturesResponse
from app.utils.auth import get_current_active_user
from app.services.audio_analyzer import run_analysis as run_audio_analysis

router = APIRouter(prefix="/api/analyze", tags=["analysis"])
logger = logging.getLogger(__name__)


@router.post("/{music_id}", response_model=AudioFeaturesResponse)
async def analyze_music(
    music_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Manually trigger (or retry) audio analysis for a track.

    This endpoint is what powers the "Analyze" button on the dashboard.
    After upload, the same logic runs as a BackgroundTask — this route
    exists for retries (e.g. when a previous attempt landed in the
    ``error`` state).

    The actual work is delegated to ``services.audio_analyzer.run_analysis``
    so upload and manual retries share the exact same code path.
    """
    # 1. Authorization (404 before 403 — standard REST).
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music not found",
        )
    if music.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to analyze this music",
        )

    # 2. Catalog tracks (e.g. Spotify) already carry features from the
    #    source API — there is no local file to analyze.  Refuse the
    #    request with a clear message instead of failing on a missing
    #    ``file_path`` deep inside librosa.
    if music.source == SOURCE_SPOTIFY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This track's features come from the source catalog; "
                   "local re-analysis is not available.",
        )

    # 3. Delegate.  We do this synchronously in the request (so the
    # caller gets the AudioFeatures back in the response).  The
    # background-task path is used by the upload route for the common
    # case of fresh uploads.
    success = run_audio_analysis(music_id)

    if not success:
        # Re-fetch in case the runner just wrote an error message we
        # want to surface.
        db.refresh(music)
        detail = "Audio analysis failed"
        if music.analysis_error:
            detail = f"Audio analysis failed: {music.analysis_error}"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
        )

    features = (
        db.query(AudioFeatures)
        .filter(AudioFeatures.music_id == music_id)
        .first()
    )
    if not features:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis reported success but no features were saved",
        )
    return features


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
