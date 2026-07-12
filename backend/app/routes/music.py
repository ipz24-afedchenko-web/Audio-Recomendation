import os
import logging
import mimetypes
from typing import List
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Form,
    Request as _Request,
)
from fastapi.responses import StreamingResponse as _StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db, get_settings
from app.models.user import User
from app.models.music import Music, ANALYSIS_STATUS_PENDING
from app.schemas.music import MusicResponse, MusicCreate, MusicUpdate, MusicWithFeatures
from app.utils.auth import get_current_active_user
from app.utils.file_validation import validate_audio_file
from app.services.ai_tagger import get_ai_tagger
from app.services.audio_analyzer import run_analysis as run_audio_analysis
from app.services.storage import get_storage

router = APIRouter(prefix="/api/music", tags=["music"])
settings = get_settings()
logger = logging.getLogger(__name__)


@router.post(
    "/upload",
    response_model=MusicResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_music(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    artist: str = Form(None),
    album: str = Form(None),
    genre: str = Form(None),
    external_id: str = Form(None),
    external_uri: str = Form(None),
    cover_url: str = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Upload a new music file.

    On success the file is stored, its SHA-256 hash is recorded and a
    BackgroundTask is scheduled to extract audio features (tempo, key,
    mode, MFCCs, energy, valence, etc.).  Polling
    ``GET /api/music/{id}`` lets the UI track analysis progress via the
    ``analysis_status`` field.

    - **409 Conflict** is returned if the same file (by content hash) has
      already been uploaded by this user.
    """
    # 1. Validate extension + magic bytes — rejects renamed non-audio
    #    files.  Must happen BEFORE we start reading the body because
    #    we cannot rewind the SpooledTemporaryFile if the file is too
    #    large.
    ok, reason = validate_audio_file(file.file, file.filename or "")
    if not ok:
        logger.warning(
            "Rejected upload by user_id=%s: %s (filename=%s)",
            current_user.id, reason, file.filename,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=reason,
        )

    # 2. Persist the file via the configured storage backend (local disk
    #    or S3).  SHA-256 is computed during the write.
    storage = get_storage()
    try:
        file_path, file_hash, file_size = storage.save(
            file.file, file.filename or "audio", settings.max_upload_size,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e),
        )
    except Exception as e:
        logger.exception("Failed to save uploaded file: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file",
        )

    if file_size == 0:
        storage.delete(file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    # 4. Deduplication: same user, same content hash → 409 Conflict.
    existing = (
        db.query(Music)
        .filter(Music.user_id == current_user.id, Music.file_hash == file_hash)
        .first()
    )
    if existing is not None:
        storage.delete(file_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This file is already in your library as "
                f"'{existing.title}'"
                + (f" by {existing.artist}" if existing.artist else "")
                + f" (uploaded {existing.created_at.strftime('%Y-%m-%d')})."
            ),
        )

    # 5. Create the database record.  Status starts as ``pending``; the
    #    background task will flip it to ``analyzing`` → ``ready`` (or
    #    ``error``).
    db_music = Music(
        title=title,
        artist=artist,
        album=album,
        genre=genre,
        external_id=external_id or None,
        external_uri=external_uri or None,
        cover_url=cover_url or None,
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        analysis_status=ANALYSIS_STATUS_PENDING,
        user_id=current_user.id,
    )
    db.add(db_music)
    db.commit()
    db.refresh(db_music)

    # 6. Schedule the analysis.  FastAPI's BackgroundTasks runs AFTER
    #    the response is sent, so the client never waits for librosa.
    background_tasks.add_task(run_audio_analysis, db_music.id)

    logger.info(
        "Upload accepted: user_id=%s music_id=%s hash=%s — analysis scheduled",
        current_user.id, db_music.id, file_hash[:12],
    )
    return db_music


@router.get("/ai-status")
async def ai_status(current_user: User = Depends(get_current_active_user)):
    """
    Check if the AI tagging service is available.
    Returns whether GEMINI_API_KEY is configured.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    return {
        "available": bool(api_key),
        "message": "AI tagging ready" if api_key else "GEMINI_API_KEY not configured"
    }


@router.get("/{music_id}", response_model=MusicResponse)
def get_music(
    music_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get music track by ID.

    Returns music metadata.
    """
    music = db.query(Music).filter(Music.id == music_id).first()
    if not music:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music not found"
        )

    # Check if user owns the music or is superuser
    if music.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this music"
        )

    return music


@router.get("/user/{user_id}", response_model=List[MusicResponse])
def get_user_music(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all music tracks for a specific user.

    - **user_id**: User ID
    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return

    Returns list of music tracks.
    """
    # Users can only see their own music unless they're superuser
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this user's music"
        )

    music_list = db.query(Music)\
        .filter(Music.user_id == user_id)\
        .offset(skip)\
        .limit(limit)\
        .all()

    return music_list


@router.delete("/{music_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_music(
    music_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Delete a music track.

    Deletes both the database record and the audio file.
    """
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
            detail="Not authorized to delete this music"
        )

    # Delete file from storage backend (catalog tracks have no file).
    if music.file_path:
        try:
            get_storage().delete(music.file_path)
        except Exception as e:
            logger.warning("Failed to delete file %s: %s", music.file_path, str(e))

    # Delete from database
    db.delete(music)
    db.commit()

    return None


@router.put("/{music_id}", response_model=MusicResponse)
def update_music(
    music_id: int,
    music_update: MusicUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Update music metadata.

    Only title, artist, album, and genre can be updated.
    """
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
            detail="Not authorized to update this music"
        )

    # Update fields
    update_data = music_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(music, field, value)

    db.commit()
    db.refresh(music)

    return music


@router.post("/auto-tag")
async def auto_tag_file(
    filename: str = Form(...),
    current_user: User = Depends(get_current_active_user)
):
    """
    Auto-tag a music file using AI.

    Uses Google Gemini API to parse the filename and MusicBrainz API to fetch metadata.

    - **filename**: The filename to parse (with or without extension)

    Returns metadata: artist, title, genre, album, year.

    **Note**: Requires GEMINI_API_KEY environment variable to be set.
    """
    try:
        tagger = get_ai_tagger()
        metadata = tagger.auto_tag(filename)

        # Best-effort Spotify lookup so the upload can be linked to a
        # catalog track.  Fails silently — auto-tagging still works without
        # a Spotify match (e.g. Spotify disabled / not yet Premium-activated).
        if metadata.get("artist") and metadata.get("title"):
            try:
                from app.services.spotify import get_spotify_client
                from app.database import get_settings as _get_settings

                if _get_settings().spotify_enabled:
                    client = get_spotify_client()
                    results = client.search(
                        f"{metadata['artist']} {metadata['title']}", limit=1
                    )
                    if results:
                        top = results[0]
                        metadata["spotify_track_id"] = top.get("spotify_track_id")
                        metadata["external_uri"] = top.get("external_uri")
                        metadata["cover_url"] = top.get("image_url")
            except Exception as se:  # noqa: BLE001
                logger.info("Spotify auto-link skipped for %s: %s", filename, se)

        return {
            "success": True,
            "metadata": metadata
        }

    except ValueError as e:
        # Missing API key
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI tagging service not configured: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Auto-tagging failed: {str(e)}"
        )


@router.get("/{music_id}/stream")
def stream_audio(
    music_id: int,
    request: _Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    from app.models.music import SOURCE_SPOTIFY

    music = db.query(Music).filter(Music.id == music_id).first()
    if music is None:
        raise HTTPException(404, "Track not found")
    if music.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(403, "Forbidden")
    if music.source == SOURCE_SPOTIFY or not music.file_path:
        raise HTTPException(404, "No audio file for this track")

    file_path = get_storage().get_local_path(music.file_path)
    if not os.path.isfile(file_path):
        logger.warning("File not found: %s", file_path)
        raise HTTPException(404, "Audio file not found")

    content_type = mimetypes.guess_type(file_path)[0] or "audio/mpeg"
    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header:
        start_str, _, end_str = range_header.replace("bytes=", "").partition("-")
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        if start >= file_size:
            raise HTTPException(416)
        content_length = end - start + 1

        def ranged():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining:
                    chunk_size = min(65536, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return _StreamingResponse(
            ranged(),
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Type": content_type,
                "Content-Length": str(content_length),
                "Accept-Ranges": "bytes",
            },
        )

    def full():
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                yield chunk

    return _StreamingResponse(
        full(),
        media_type=content_type,
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
        },
    )
