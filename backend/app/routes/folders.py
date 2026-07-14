from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import logging

from app.database import get_db
from app.models.user import User
from app.models.folder import Folder
from app.models.music import Music
from app.schemas.folder import FolderResponse, FolderCreate
from app.utils.auth import get_current_active_user

router = APIRouter(prefix="/api/folders", tags=["folders"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[FolderResponse])
def list_folders(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List the current user's folders, each annotated with its track count.

    The count is computed in a single query via a LEFT OUTER JOIN +
    ``func.count`` grouped by folder id, so we avoid the N+1 lookups of
    the naive per-folder ``count()`` approach.
    """
    counts = (
        db.query(Music.folder_id, func.count(Music.id).label("track_count"))
        .filter(Music.user_id == current_user.id)
        .group_by(Music.folder_id)
        .all()
    )
    count_map = {folder_id: cnt for folder_id, cnt in counts}

    folders = (
        db.query(Folder)
        .filter(Folder.user_id == current_user.id)
        .order_by(Folder.name)
        .all()
    )
    result = []
    for folder in folders:
        data = FolderResponse.model_validate(folder)
        data.track_count = count_map.get(folder.id, 0)
        result.append(data)
    return result


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    payload: FolderCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new folder for the current user."""
    existing = (
        db.query(Folder)
        .filter(Folder.user_id == current_user.id, Folder.name == payload.name)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a folder named '{payload.name}'",
        )
    folder = Folder(name=payload.name, user_id=current_user.id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    logger.info("Folder created: user_id=%s folder_id=%s", current_user.id, folder.id)
    data = FolderResponse.model_validate(folder)
    data.track_count = 0
    return data


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Delete a folder.

    Tracks inside the folder are NOT deleted — their ``folder_id`` is set to
    NULL (moved back to "Uncategorized") so the user never loses music by
    removing an organising label.  Enforced server-side via
    ``ON DELETE SET NULL`` and also applied explicitly here for SQLite.
    """
    folder = (
        db.query(Folder)
        .filter(Folder.id == folder_id, Folder.user_id == current_user.id)
        .first()
    )
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )

    # Detach tracks before dropping the folder (defensive — the FK also does
    # this at the DB level on Postgres).
    db.query(Music).filter(Music.folder_id == folder.id).update(
        {Music.folder_id: None}
    )
    db.delete(folder)
    db.commit()
    logger.info("Folder deleted: user_id=%s folder_id=%s", current_user.id, folder_id)
    return None
