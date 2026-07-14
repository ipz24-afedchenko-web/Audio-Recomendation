from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class FolderBase(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Folder name must not be empty")
        return v.strip()


class FolderCreate(FolderBase):
    pass


class FolderResponse(FolderBase):
    id: int
    user_id: int
    created_at: datetime
    # Populated by the API: number of tracks currently in the folder.
    track_count: int = 0

    class Config:
        from_attributes = True
