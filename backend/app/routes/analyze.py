from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.user import User
from app.models.music import Music, SOURCE_SPOTIFY
from app.models.audio_features import AudioFeatures
from app.schemas.audio_features import AudioFeaturesResponse
from app.utils.auth import get_current_active_user
from app.utils.slug import resolve_music
from app.services.audio_analyzer import run_analysis as run_audio_analysis

router = APIRouter(prefix="/api/analyze", tags=["analysis"])
logger = logging.getLogger(__name__)


@router.post("/{id_or_slug}", response_model=AudioFeaturesResponse)
async def analyze_music(
    id_or_slug: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Manually trigger (or retry) audio analysis for a track by ID or slug.

    This endpoint is what powers the "Analyze" button on the dashboard.
    After upload, the same logic runs as a BackgroundTask — this route
    exists for retries (e.g. when a previous attempt landed in the
    ``error`` state).

    The actual work is delegated to ``services.audio_analyzer.run_analysis``
    so upload and manual retries share the exact same code path.
    """
    # 1. Authorization (404 before 403 — standard REST).  Accepts either a
    #    numeric ID or a per-user slug.
    music = resolve_music(db, current_user, id_or_slug)

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
    success = run_audio_analysis(music.id)

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
        .filter(AudioFeatures.music_id == music.id)
        .first()
    )
    if not features:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis reported success but no features were saved",
        )
    return features


@router.get("/features/{id_or_slug}", response_model=AudioFeaturesResponse)
def get_audio_features(
    id_or_slug: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get audio features for a music track by ID or slug.

    Returns audio features if the track has been analyzed.
    """
    # Get music record + enforce ownership (404 before 403).
    music = resolve_music(db, current_user, id_or_slug)

    # Get features
    features = db.query(AudioFeatures).filter(
        AudioFeatures.music_id == music.id
    ).first()

    if not features:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio features not found. Run analysis first."
        )

    return features
