import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db, get_settings
from app.models.user import User
from app.models.music import Music
from app.schemas.music import MusicResponse, MusicCreate, MusicUpdate, MusicWithFeatures
from app.utils.auth import get_current_active_user
from app.services.ai_tagger import get_ai_tagger

router = APIRouter(prefix="/api/music", tags=["music"])
settings = get_settings()

# Create upload directory if it doesn't exist
os.makedirs(settings.upload_dir, exist_ok=True)


@router.post("/upload", response_model=MusicResponse, status_code=status.HTTP_201_CREATED)
async def upload_music(
    file: UploadFile = File(...),
    title: str = Form(...),
    artist: str = Form(None),
    album: str = Form(None),
    genre: str = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Upload a new music file.

    - **file**: Audio file (mp3, wav, flac, ogg)
    - **title**: Track title
    - **artist**: Artist name (optional)
    - **album**: Album name (optional)
    - **genre**: Genre (optional)

    Returns created music record.
    """
    # Validate file type
    allowed_extensions = {".mp3", ".wav", ".flac", ".ogg"}
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
        )

    # Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to start

    if file_size > settings.max_upload_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {settings.max_upload_size} bytes"
        )

    # Create unique filename
    import uuid
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(settings.upload_dir, unique_filename)

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )

    # Create database record
    db_music = Music(
        title=title,
        artist=artist,
        album=album,
        genre=genre,
        file_path=file_path,
        file_size=file_size,
        user_id=current_user.id
    )
    db.add(db_music)
    db.commit()
    db.refresh(db_music)

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

    # Delete file from disk
    try:
        if os.path.exists(music.file_path):
            os.remove(music.file_path)
    except Exception as e:
        # Log error but continue with database deletion
        print(f"Failed to delete file {music.file_path}: {str(e)}")

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
