"""
A/B testing statistics (W4-2).

Extends the Phase-1 A/B plumbing (model + ``/api/ab/*`` endpoints) with:

* per-algorithm CTR plus a two-proportion z-test that tells us whether the
  best-performing algorithm is *statistically significantly* better than the
  runner-up, and
* a persisted "default algorithm" that normal recommendations fall back to
  once a winner has been promoted.

The z-test is implemented in pure stdlib (``math.erf``) so we don't take a
new runtime dependency on scipy.
"""

import logging
import math
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.algorithm_event import AlgorithmEvent
from app.models.ab_config import ABConfig

logger = logging.getLogger(__name__)

ALGORITHMS = [1, 2, 3]


def _normal_cdf(x: float) -> float:
    """Standard normal CDF via the error function."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def two_proportion_ztest(
    clicks_a: int, n_a: int, clicks_b: int, n_b: int
) -> Optional[Dict[str, float]]:
    """
    Two-proportion z-test for the difference in CTR between two algorithms.

    Returns ``{"z": float, "p_value": float}`` (two-sided), or ``None`` when
    there is not enough data to compute a meaningful result (either sample is
    empty, or the pooled proportion makes the standard error zero).
    """
    if n_a <= 0 or n_b <= 0:
        return None

    p_a = clicks_a / n_a
    p_b = clicks_b / n_b
    p_pool = (clicks_a + clicks_b) / (n_a + n_b)

    se = math.sqrt(p_pool * (1.0 - p_pool) * (1.0 / n_a + 1.0 / n_b))
    if se == 0:
        return None

    z = (p_a - p_b) / se
    # Two-sided p-value.
    p_value = 2.0 * (1.0 - _normal_cdf(abs(z)))
    return {"z": round(z, 4), "p_value": round(p_value, 6)}


def _raw_counts(db: Session) -> Dict[int, Dict[str, int]]:
    """Impressions / clicks / plays per algorithm from the event table."""
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
    out: Dict[int, Dict[str, int]] = {}
    for algo, impressions, clicks, plays in rows:
        out[algo] = {
            "impressions": impressions,
            "clicks": clicks,
            "plays": plays,
        }
    return out


def compute_ab_stats(db: Session, significance_level: float = 0.05) -> Dict:
    """
    Build the full A/B stats payload including significance testing.

    The best algorithm is the one with the highest CTR.  We then compare it
    against every other algorithm that has impressions via a two-proportion
    z-test and report the *minimum* p-value (most conservative).  The winner
    is flagged significant only if it beats *all* alternatives at the chosen
    level.
    """
    counts = _raw_counts(db)

    # Ensure every known algorithm appears (even with zero data) so the UI
    # always has a stable set of rows.
    for algo in ALGORITHMS:
        counts.setdefault(algo, {"impressions": 0, "clicks": 0, "plays": 0})

    rows = []
    best_algorithm: Optional[int] = None
    best_ctr = -1.0
    for algo in ALGORITHMS:
        c = counts[algo]
        impressions = c["impressions"]
        clicks = c["clicks"]
        ctr = (clicks / impressions * 100.0) if impressions > 0 else 0.0
        rows.append({
            "algorithm": algo,
            "impressions": impressions,
            "clicks": clicks,
            "plays": c["plays"],
            "ctr": round(ctr, 2),
            "z_score": None,
            "p_value": None,
            "significant": False,
        })
        if impressions > 0 and ctr > best_ctr:
            best_ctr = ctr
            best_algorithm = algo

    winner_significant = False
    if best_algorithm is not None:
        best = counts[best_algorithm]
        min_p = 1.0
        worst_z = None
        for algo in ALGORITHMS:
            if algo == best_algorithm:
                continue
            other = counts[algo]
            if other["impressions"] <= 0:
                # Can't compare against an algorithm with no data.
                continue
            test = two_proportion_ztest(
                best["clicks"], best["impressions"],
                other["clicks"], other["impressions"],
            )
            if test is None:
                continue
            if test["p_value"] < min_p:
                min_p = test["p_value"]
                worst_z = test["z"]
        if min_p < 1.0:
            winner_significant = min_p < significance_level
            # Attach the most conservative (max p) comparison to the winner row.
            for r in rows:
                if r["algorithm"] == best_algorithm:
                    r["z_score"] = worst_z
                    r["p_value"] = round(min_p, 6)
                    r["significant"] = winner_significant

    total_events = db.query(func.count(AlgorithmEvent.id)).scalar() or 0
    default_algorithm = get_default_algorithm(db)

    return {
        "total_events": total_events,
        "rows": rows,
        "best_algorithm": best_algorithm,
        "winner_significant": winner_significant,
        "default_algorithm": default_algorithm,
    }


def get_default_algorithm(db: Session) -> int:
    """Return the currently promoted default algorithm (fallback 3)."""
    try:
        return ABConfig._singleton(db).default_algorithm
    except SQLAlchemyError as e:  # pragma: no cover - defensive
        logger.warning("Could not read ab_config, using default 3: %s", str(e))
        return 3


def set_default_algorithm(db: Session, algorithm: int) -> int:
    """Persist the promoted default algorithm.  Returns the new value."""
    if algorithm not in ALGORITHMS:
        raise ValueError(f"algorithm must be one of {ALGORITHMS}")
    row = ABConfig._singleton(db)
    row.default_algorithm = algorithm
    db.commit()
    logger.info("Promoted algorithm %d as the default recommendation algorithm", algorithm)
    return algorithm
