"""
A/B Testing Routes

Tracks recommendation algorithm performance metrics (impressions, clicks, plays)
so that the system can evaluate which algorithm delivers the best engagement.

Endpoints:
- POST /api/ab/event     — record an interaction event
- GET  /api/ab/stats     — CTR summary + significance per algorithm (W4-2)
- POST /api/ab/promote   — promote the winning algorithm as the default (superuser)
- GET  /api/ab/default   — current default algorithm
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.algorithm_event import AlgorithmEvent
from app.models.user import User
from app.schemas.algorithm_event import (
    ABStatsResponse,
    AlgorithmEventCreate,
    AlgorithmEventResponse,
)
from app.services.ab_stats import (
    compute_ab_stats,
    get_default_algorithm,
    set_default_algorithm,
)
from app.utils.auth import get_current_active_user

router = APIRouter(prefix="/api/ab", tags=["ab_testing"])
logger = logging.getLogger(__name__)


@router.post("/event", response_model=AlgorithmEventResponse)
def record_event(
    event: AlgorithmEventCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Record an algorithm interaction event (impression, click, or play)."""
    db_event = AlgorithmEvent(
        user_id=current_user.id,
        algorithm=event.algorithm,
        source_music_id=event.source_music_id,
        recommended_music_id=event.recommended_music_id,
        event_type=event.event_type,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@router.get("/stats", response_model=ABStatsResponse)
def get_ab_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Return A/B test summary with statistical significance (W4-2).

    Per algorithm: impressions, clicks, plays, CTR, plus the two-proportion
    z-test ``z_score`` / ``p_value`` / ``significant`` flag comparing the
    best-performing algorithm against the others.  The response also carries
    ``best_algorithm``, ``winner_significant`` and the promoted
    ``default_algorithm``.
    """
    return compute_ab_stats(db)


@router.get("/default")
def get_default(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the currently promoted default recommendation algorithm."""
    return {"default_algorithm": get_default_algorithm(db)}


@router.post("/promote")
def promote_algorithm(
    algorithm: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Promote an algorithm as the default used for normal (non A/B) requests.

    Restricted to superusers.  Callers normally pass the ``best_algorithm``
    from ``GET /api/ab/stats`` once ``winner_significant`` is true, but any
    of the three algorithms may be promoted manually.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superusers can promote the default algorithm",
        )
    try:
        new_default = set_default_algorithm(db, algorithm)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return {"default_algorithm": new_default}
