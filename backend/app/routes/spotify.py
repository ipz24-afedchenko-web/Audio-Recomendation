import logging
from datetime import datetime, timezone
import secrets as _secrets
from urllib.parse import urlencode as _urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, get_settings
from app.models.music import (
    Music,
    ANALYSIS_STATUS_READY,
    SOURCE_SPOTIFY,
)
from app.models.audio_features import AudioFeatures
from app.models.spotify_auth import SpotifyAuth as SpotifyAuthModel
from app.schemas.music import (
    MusicResponse,
    SpotifySearchResult,
    SpotifyAddRequest,
)
from app.utils.auth import get_current_active_user
from app.models.user import User
from app.services.spotify import (
    SpotifyClient,
    SpotifyError,
    get_spotify_client,
    is_spotify_healthy,
    mark_spotify_unhealthy,
    _synthesize_features,
)


class SpotifyAuthCallbackRequest(BaseModel):
    code: str

router = APIRouter(prefix="/api/spotify", tags=["spotify"])
settings = get_settings()
logger = logging.getLogger(__name__)


def _require_spotify() -> SpotifyClient:
    if not settings.spotify_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Spotify integration is not configured (missing credentials)",
        )
    return get_spotify_client()


@router.get("/status")
def spotify_status(current_user: User = Depends(get_current_active_user)):
    """Report whether the Spotify catalog integration is usable.

    Combines the static config flag with a runtime health probe: the
    free Spotify Web API only works once the app owner holds an active
    Premium subscription (and Spotify can take hours to activate it).
    The frontend hides the "From Spotify" tab when ``enabled`` is false.
    """
    return {"enabled": is_spotify_healthy()}


@router.get("/search", response_model=list[SpotifySearchResult])
def spotify_search(
    q: str,
    limit: int = 10,
    current_user: User = Depends(get_current_active_user),
):
    """Search the free Spotify catalog.  Returns lightweight track cards
    (no DB write).  The frontend renders previews and lets the user pick
    one to actually add."""
    if not q or not q.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query parameter 'q' is required",
        )
    client = _require_spotify()
    try:
        results = client.search(q.strip(), limit=min(max(limit, 1), 10))
    except SpotifyError as e:
        # A live failure (e.g. 403 after Premium lapses) means the
        # service is currently unusable — hide the tab until the next
        # health probe.  This also flips the cached health immediately
        # so the tab disappears without waiting for the TTL.
        mark_spotify_unhealthy()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify search failed: {e}",
        )
    return [SpotifySearchResult(**r) for r in results]


@router.post(
    "/add",
    response_model=MusicResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_spotify_track(
    payload: SpotifyAddRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Add a Spotify track to the user's library.

    Features come straight from the Spotify Web API (no file, no librosa,
    no audio stored) — ideal for free hosting.  The track is immediately
    ``ready``; we write both the ``Music`` row and its ``AudioFeatures``
    (``feature_origin='spotify'``) in one transaction.
    """
    client = _require_spotify()
    track_id = payload.spotify_track_id

    # 1. Fetch track metadata from Spotify.
    try:
        track = client.get_track(track_id)
    except SpotifyError as e:
        mark_spotify_unhealthy()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify lookup failed: {e}",
        )

    # 2. Audio features are best-effort.  Spotify deprecated the
    #    audio-features endpoint, so fall back to synthesised defaults —
    #    map_to_features already tolerates missing fields.
    try:
        raw_features = client.get_audio_features(track_id) or {}
    except SpotifyError:
        logger.info(
            "Spotify audio-features unavailable for %s; using synthetic defaults",
            track_id,
        )
        raw_features = _synthesize_features(track)

    # 2. Dedup: one catalog track per user.
    existing = (
        db.query(Music)
        .filter(
            Music.user_id == current_user.id,
            Music.source == SOURCE_SPOTIFY,
            Music.external_id == track_id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{track.get('title')}' is already in your library",
        )

    # 3. Persist Music row (no file_path, no hash).
    db_music = Music(
        title=track.get("title") or "Unknown",
        artist=track.get("artist"),
        album=track.get("album"),
        duration=(track.get("duration_ms") or 0) / 1000.0,
        source=SOURCE_SPOTIFY,
        external_id=track_id,
        external_uri=track.get("external_uri"),
        preview_url=track.get("preview_url"),
        analysis_status=ANALYSIS_STATUS_READY,
        user_id=current_user.id,
    )
    db.add(db_music)
    db.flush()  # assign PK for the features FK

    # 4. Map Spotify features into our AudioFeatures space.
    features = client.map_to_features(track, raw_features)
    db_features = AudioFeatures(music_id=db_music.id, **features)
    db.add(db_features)

    db.commit()
    db.refresh(db_music)
    logger.info(
        "Spotify track added: user_id=%s music_id=%s track=%s",
        current_user.id, db_music.id, track_id,
    )
    return db_music


_SPOTIFY_AUTH_SCOPES = (
    "streaming "
    "user-read-email "
    "user-read-private "
    "user-read-playback-state "
    "user-modify-playback-state "
    "user-read-currently-playing"
)


@router.get("/auth/login")
def spotify_auth_login(
    current_user: User = Depends(get_current_active_user),
):
    """Generate the Spotify OAuth authorize URL for the global player."""
    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": settings.spotify_redirect_uri,
        "scope": _SPOTIFY_AUTH_SCOPES.strip(),
        "state": _secrets.token_urlsafe(16),
    }
    url = f"https://accounts.spotify.com/authorize?{_urlencode(params)}"
    return {"url": url}


@router.post("/auth/callback")
def spotify_auth_callback(
    payload: SpotifyAuthCallbackRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Exchange an authorization code for Spotify tokens and store them."""
    import httpx as _httpx

    token_url = "https://accounts.spotify.com/api/token"
    data = {
        "grant_type": "authorization_code",
        "code": payload.code,
        "redirect_uri": settings.spotify_redirect_uri,
        "client_id": settings.spotify_client_id,
        "client_secret": settings.spotify_client_secret,
    }

    resp = _httpx.post(token_url, data=data, timeout=10)
    if resp.status_code != 200:
        logger.error("Spotify token exchange failed: %s", resp.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Spotify token exchange failed",
        )

    body = resp.json()
    expires_at = int(datetime.now(timezone.utc).timestamp()) + body.get("expires_in", 3600)

    existing = (
        db.query(SpotifyAuthModel)
        .filter(SpotifyAuthModel.user_id == current_user.id)
        .first()
    )

    if existing is not None:
        existing.access_token = body["access_token"]
        existing.refresh_token = body.get("refresh_token", existing.refresh_token)
        existing.expires_at = expires_at
        existing.scope = body.get("scope", existing.scope)
    else:
        auth = SpotifyAuthModel(
            user_id=current_user.id,
            access_token=body["access_token"],
            refresh_token=body.get("refresh_token", ""),
            expires_at=expires_at,
            scope=body.get("scope"),
        )
        db.add(auth)

    db.commit()
    logger.info("Spotify OAuth tokens stored for user_id=%s", current_user.id)
    return {"ok": True}


@router.get("/auth/status")
def spotify_auth_status(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Check whether the current user has a valid (non-expired) Spotify connection."""
    auth = (
        db.query(SpotifyAuthModel)
        .filter(SpotifyAuthModel.user_id == current_user.id)
        .first()
    )
    if auth is None:
        return {"connected": False}

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if auth.expires_at <= now_ts:
        return {"connected": False}

    return {"connected": True}


@router.get("/auth/player-token")
def spotify_auth_player_token(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the current user's Spotify access token, refreshing if expired."""
    auth = (
        db.query(SpotifyAuthModel)
        .filter(SpotifyAuthModel.user_id == current_user.id)
        .first()
    )
    if auth is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spotify account not connected",
        )

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if auth.expires_at > now_ts:
        return {"token": auth.access_token}

    import httpx as _httpx

    token_url = "https://accounts.spotify.com/api/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": auth.refresh_token,
        "client_id": settings.spotify_client_id,
        "client_secret": settings.spotify_client_secret,
    }

    resp = _httpx.post(token_url, data=data, timeout=10)
    if resp.status_code != 200:
        logger.error("Spotify token refresh failed: %s", resp.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Spotify token refresh failed",
        )

    body = resp.json()
    auth.access_token = body.get("access_token", auth.access_token)
    auth.expires_at = int(datetime.now(timezone.utc).timestamp()) + body.get("expires_in", 3600)
    if "refresh_token" in body:
        auth.refresh_token = body["refresh_token"]
    db.commit()

    return {"token": auth.access_token}
