"""
A/B Testing Routes

Tracks recommendation algorithm performance metrics (impressions, clicks, plays)
so that the system can evaluate which algorithm delivers the best engagement.

Endpoints:
- POST /api/ab/event    — record an interaction event
- GET  /api/ab/stats    — get CTR summary per algorithm
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.algorithm_event import AlgorithmEvent
from app.models.user import User
from app.schemas.algorithm_event import (
    ABStatsResponse,
    ABStatsRow,
    AlgorithmEventCreate,
    AlgorithmEventResponse,
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
    Return A/B test summary: impressions, clicks, plays, and CTR per algorithm.

    CTR = clicks / impressions (0 if no impressions).
    """
    rows = (
        db.query(
            AlgorithmEvent.algorithm,
            func.count().filter(AlgorithmEvent.event_type == "impression").label("impressions"),
            func.count().filter(AlgorithmEvent.event_type == "click").label("clicks"),
            func.count().filter(AlgorithmEvent.event_type == "play").label("plays"),
        )
        .group_by(AlgorithmEvent.algorithm)
        .order_by(AlgorithmEvent.algorithm)
        .all()
    )

    total_events = (
        db.query(func.count(AlgorithmEvent.id))
        .scalar() or 0
    )

    stats_rows = []
    for algo, impressions, clicks, plays in rows:
        ctr = (clicks / impressions * 100) if impressions > 0 else 0.0
        stats_rows.append(ABStatsRow(
            algorithm=algo,
            impressions=impressions,
            clicks=clicks,
            plays=plays,
            ctr=round(ctr, 2),
        ))

    return ABStatsResponse(total_events=total_events, rows=stats_rows)
