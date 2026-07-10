import logging
from datetime import datetime, timezone
import secrets as _secrets
from urllib.parse import urlencode as _urlencode

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
import io
import httpx
import librosa
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
    SpotifyPlayRequest,
)
from app.utils.auth import get_current_active_user
from app.models.user import User
from app.services.spotify import (
    SPOTIFY_API_BASE,
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

def _analyze_spotify_preview_task(music_id: int, preview_url: str | None, title: str = "", artist: str = ""):
    from app.database import SessionLocal
    from app.models.music import Music, ANALYSIS_STATUS_READY, ANALYSIS_STATUS_ERROR
    from app.services.audio_analyzer import AudioAnalyzer
    
    db = SessionLocal()
    try:
        music = db.query(Music).filter(Music.id == music_id).first()
        if not music or not music.audio_features:
            return
            
        try:
            import httpx
            import tempfile
            
            resp_content = None
            
            with open(f"/app/debug_task_{music_id}.txt", "w") as df:
                df.write(f"title={repr(title)}, artist={repr(artist)}, preview={repr(preview_url)}")
            
            if preview_url:
                try:
                    with httpx.Client(timeout=10) as client:
                        resp = client.get(preview_url)
                        resp.raise_for_status()
                        resp_content = resp.content
                except Exception as e:
                    logger.warning("Spotify preview fetch failed: %s", e)
            
            if not resp_content and title and artist:
                try:
                    import urllib.parse
                    query = urllib.parse.quote_plus(f"{title} {artist}")
                    itunes_url = f"https://itunes.apple.com/search?term={query}&media=music&limit=1"
                    logger.info("Trying iTunes fallback: %s", itunes_url)
                    with httpx.Client(timeout=10) as client:
                        itunes_resp = client.get(itunes_url)
                        itunes_resp.raise_for_status()
                        data = itunes_resp.json()
                        logger.info("iTunes results count: %d", len(data.get("results", [])))
                        if data.get("results") and data["results"][0].get("previewUrl"):
                            fallback_url = data["results"][0]["previewUrl"]
                            logger.info("Downloading iTunes preview: %s", fallback_url)
                            resp2 = client.get(fallback_url)
                            resp2.raise_for_status()
                            resp_content = resp2.content
                        else:
                            logger.warning("iTunes search succeeded but no previewUrl found. Data: %s", data)
                except Exception as e:
                    logger.warning("iTunes preview fallback failed: %s", e)
                    
            if not resp_content:
                raise Exception("No preview audio available from Spotify or iTunes.")

            with tempfile.NamedTemporaryFile(suffix=".m4a", delete=True) as tmp:
                tmp.write(resp_content)
                tmp.flush()
                import librosa
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    y, sr = librosa.load(tmp.name, sr=22050)
            
            analyzer = AudioAnalyzer(sr=sr)
            mfcc_feat = analyzer._extract_timbre_features(y, sr)
            chroma_feat = analyzer._extract_harmony_features(y, sr)
            
            feats = music.audio_features
            if mfcc_feat.get("mfcc_mean"):
                feats.mfcc_mean = mfcc_feat["mfcc_mean"]
                feats.mfcc_std = mfcc_feat["mfcc_std"]
            if chroma_feat.get("chroma_stft_mean"):
                feats.chroma_stft_mean = chroma_feat["chroma_stft_mean"]
                feats.chroma_stft_std = chroma_feat["chroma_stft_std"]
                
        except Exception as e:
            logger.warning("Failed to analyze preview for music_id=%s: %s", music_id, e)
            music.analysis_error = str(e)[:500]
            if music.audio_features:
                music.audio_features.mfcc_mean = None
                music.audio_features.mfcc_std = None
                music.audio_features.chroma_stft_mean = None
                music.audio_features.chroma_stft_std = None
        else:
            music.analysis_error = None
            
        music.analysis_status = ANALYSIS_STATUS_READY
        db.commit()
        
        try:
            from app.services.ml_recommender import MLRecommender
            recommender = MLRecommender()
            recommender.load_models()
            recommender.auto_retrain_if_needed(db)
        except Exception as e:
            logger.warning("Auto-retrain after Spotify analysis failed: %s", e)
            
    finally:
        db.close()


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
    background_tasks: BackgroundTasks,
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

    preview_url = track.get("preview_url")

    # 3. Persist Music row (no file_path, no hash).
    db_music = Music(
        title=track.get("title") or "Unknown",
        artist=track.get("artist"),
        album=track.get("album"),
        duration=(track.get("duration_ms") or 0) / 1000.0,
        source=SOURCE_SPOTIFY,
        external_id=track_id,
        external_uri=track.get("external_uri"),
        preview_url=preview_url,
        analysis_status="analyzing",
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
    
    artist_name = track.get("artist") or ""
    title = track.get("title") or ""
    background_tasks.add_task(_analyze_spotify_preview_task, db_music.id, preview_url, title, artist_name)
        
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


def _ensure_token(auth, db) -> str:
    """Return a valid Spotify access token for ``auth``, refreshing if expired."""
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if auth.expires_at > now_ts:
        return auth.access_token

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
    auth.expires_at = now_ts + body.get("expires_in", 3600)
    if "refresh_token" in body:
        auth.refresh_token = body["refresh_token"]
    db.commit()
    return auth.access_token


@router.post("/play")
def spotify_play(
    payload: SpotifyPlayRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Start playback on the user's Web Playback SDK device (or active device).

    The browser registers itself as a Spotify Connect device via the SDK;
    this endpoint uses the stored user token to command playback there.
    """
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
    token = _ensure_token(auth, db)
    body = {}
    if payload.uri:
        body["uris"] = [payload.uri]
    params = {}
    if payload.device_id:
        params["device_id"] = payload.device_id
    import httpx as _httpx  # noqa: PLC0415
    try:
        resp = _httpx.put(
            f"{SPOTIFY_API_BASE}/me/player/play",
            params=params,
            json=body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except Exception as e:  # noqa: BLE001
        logger.error("Spotify play request error: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify play failed: {e}",
        )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify play failed ({resp.status_code}): {resp.text[:200]}",
        )
    return {"ok": True}


@router.post("/pause")
def spotify_pause(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
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
    token = _ensure_token(auth, db)
    import httpx as _httpx  # noqa: PLC0415
    resp = _httpx.put(
        f"{SPOTIFY_API_BASE}/me/player/pause",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify pause failed ({resp.status_code})",
        )
    return {"ok": True}


@router.post("/seek")
def spotify_seek(
    position_ms: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
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
    token = _ensure_token(auth, db)
    import httpx as _httpx  # noqa: PLC0415
    resp = _httpx.put(
        f"{SPOTIFY_API_BASE}/me/player/seek?position_ms={int(position_ms)}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Spotify seek failed ({resp.status_code})",
        )
    return {"ok": True}


@router.get("/player")
def spotify_player_state(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the current Spotify playback state (is_playing, progress_ms, duration_ms).

    Proxies ``GET /me/player`` from the Spotify Web API.  Returns zeros when
    nothing is playing instead of a 204, so the frontend doesn't have to
    handle a special empty state.
    """
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
    token = _ensure_token(auth, db)
    import httpx as _httpx  # noqa: PLC0415
    resp = _httpx.get(
        f"{SPOTIFY_API_BASE}/me/player",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code == 204:
        return {"is_playing": False, "progress_ms": 0, "duration_ms": 0}
    if resp.status_code != 200:
        return {"is_playing": False, "progress_ms": 0, "duration_ms": 0}
    data = resp.json()
    item = data.get("item") or {}
    return {
        "is_playing": data.get("is_playing", False),
        "progress_ms": data.get("progress_ms", 0),
        "duration_ms": item.get("duration_ms", 0),
    }


@router.post("/auth/disconnect")
def spotify_auth_disconnect(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Remove the current user's stored Spotify tokens (disconnect)."""
    deleted = (
        db.query(SpotifyAuthModel)
        .filter(SpotifyAuthModel.user_id == current_user.id)
        .delete()
    )
    db.commit()
    logger.info(
        "Spotify disconnected for user_id=%s (rows=%s)", current_user.id, deleted
    )
    return {"ok": True, "disconnected": bool(deleted)}
