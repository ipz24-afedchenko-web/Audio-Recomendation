"""
Admin Dashboard API (W4-3).

Superuser-only endpoints that back the admin dashboard:
- GET /api/admin/stats — user / track / analysed counts plus the A/B test
  summary (reuses the W4-2 stats service).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.music import Music
from app.models.audio_features import AudioFeatures
from app.services.ab_stats import compute_ab_stats
from app.utils.auth import get_current_active_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
def admin_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Aggregate stats for the admin dashboard.

    Requires superuser privileges.  Combines library counts (users, tracks,
    analysed tracks) with the A/B test summary so the dashboard can render
    everything in a single request.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    user_count = db.query(func.count(User.id)).scalar() or 0
    music_count = db.query(func.count(Music.id)).scalar() or 0
    analyzed_count = db.query(func.count(AudioFeatures.id)).scalar() or 0

    ab = compute_ab_stats(db)

    return {
        "user_count": user_count,
        "music_count": music_count,
        "analyzed_count": analyzed_count,
        "ab": ab,
    }
