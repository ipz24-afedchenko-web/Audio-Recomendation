"""URL-friendly slug generation and resolution helpers for Music tracks.

Slugs are derived from ``artist`` + ``title`` (e.g. ``tdme-antytila``) so
that links such as ``/analyze/tdme-antytila`` are human-readable.  They are
unique per user: if a generated base slug collides with an existing track
owned by the same user, a short random suffix is appended.
"""
import re
import secrets

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.music import Music

_SLUG_RE = re.compile(r"[^\w\s-]")
_WS_RE = re.compile(r"[\s_-]+")


def _slugify_base(artist: str | None, title: str | None, max_len: int = 200) -> str:
    """Build a URL-safe base slug from artist + title."""
    raw = f"{artist or ''} {title or ''}".strip()
    if not raw:
        raw = "untitled"
    # Lower-case, strip anything that is not a word char / space / hyphen.
    s = _SLUG_RE.sub("", raw.lower())
    # Collapse whitespace/hyphens/underscores into single hyphens.
    s = _WS_RE.sub("-", s).strip("-")
    if not s:
        s = "untitled"
    return s[:max_len]


def generate_unique_slug(
    db: Session,
    user_id: int,
    artist: str | None,
    title: str | None,
    max_suffix_attempts: int = 8,
) -> str:
    """Return a slug for ``(user_id, artist, title)`` that is unique for the user.

    The base slug is returned as-is when free; otherwise a short
    ``-<random>`` suffix is appended (and uniqueness re-checked) until a
    free candidate is found.
    """
    base = _slugify_base(artist, title)

    def _exists(candidate: str) -> bool:
        return (
            db.query(Music)
            .filter(Music.user_id == user_id, Music.slug == candidate)
            .first()
            is not None
        )

    if not _exists(base):
        return base

    for _ in range(max_suffix_attempts):
        suffix = secrets.token_hex(4)  # 8 hex chars
        candidate = f"{base}-{suffix}"
        if not _exists(candidate):
            return candidate

    # Extremely unlikely fallback: rely on a longer random suffix.
    return f"{base}-{secrets.token_hex(8)}"


def resolve_music(
    db: Session,
    user,
    id_or_slug: str,
) -> Music:
    """Fetch a Music row by integer id OR unique per-user slug.

    Enforces ownership (or superuser) exactly like the previous id-only
    lookups did — a 404 is returned before a 403 so the REST surface stays
    consistent (callers can't probe other users' slugs).
    """
    # Try integer id first; if not parseable, treat the whole path segment
    # as a slug.
    music_id: int | None = None
    try:
        music_id = int(id_or_slug)
    except (TypeError, ValueError):
        music_id = None

    music: Music | None = None
    if music_id is not None:
        music = db.query(Music).filter(Music.id == music_id).first()
    if music is None:
        music = (
            db.query(Music)
            .filter(Music.user_id == user.id, Music.slug == id_or_slug)
            .first()
        )

    if music is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Music not found",
        )
    if music.user_id != user.id and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this music",
        )
    return music
