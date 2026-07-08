"""
Tests for W4-2: A/B statistical significance + default-algorithm promotion.
"""

import pytest

from app.models.user import User
from app.models.algorithm_event import AlgorithmEvent
from app.models.ab_config import ABConfig
from app.services.ab_stats import (
    compute_ab_stats,
    get_default_algorithm,
    set_default_algorithm,
    two_proportion_ztest,
)


def _make_user(db_session, superuser=False):
    u = User(
        email=f"ab{'su' if superuser else 'reg'}@x.com",
        username=f"absu" if superuser else "abreg",
        hashed_password="x",
        is_active=True,
        is_superuser=superuser,
    )
    db_session.add(u)
    db_session.flush()
    return u


def _add_event(db_session, user_id, algorithm, source_id, etype):
    db_session.add(AlgorithmEvent(
        user_id=user_id, algorithm=algorithm,
        source_music_id=source_id, recommended_music_id=source_id + 100,
        event_type=etype,
    ))


def test_two_proportion_ztest_basic():
    # 50/100 vs 30/100 → clearly different, significant.
    res = two_proportion_ztest(50, 100, 30, 100)
    assert res is not None
    assert res["z"] > 0  # first has higher CTR
    assert res["p_value"] < 0.05


def test_two_proportion_ztest_equal():
    # Identical proportions → z ~ 0, p ~ 1 (not significant).
    res = two_proportion_ztest(40, 100, 40, 100)
    assert res["z"] == 0.0
    assert res["p_value"] >= 0.99


def test_two_proportion_ztest_empty():
    assert two_proportion_ztest(0, 0, 10, 100) is None


def test_compute_ab_stats_flags_winner(db_session):
    u = _make_user(db_session)
    db_session.flush()
    # Algorithm 1: 80 clicks / 100 impressions (CTR 80%)
    for _ in range(100):
        _add_event(db_session, u.id, 1, 1, "impression")
    for _ in range(80):
        _add_event(db_session, u.id, 1, 1, "click")
    # Algorithm 2: 30 clicks / 100 impressions (CTR 30%)
    for _ in range(100):
        _add_event(db_session, u.id, 2, 2, "impression")
    for _ in range(30):
        _add_event(db_session, u.id, 2, 2, "click")
    # Algorithm 3: no data
    db_session.commit()

    stats = compute_ab_stats(db_session)
    assert stats["best_algorithm"] == 1
    assert stats["winner_significant"] is True
    winner_row = next(r for r in stats["rows"] if r["algorithm"] == 1)
    assert winner_row["significant"] is True
    assert winner_row["p_value"] is not None
    assert winner_row["p_value"] < 0.05


def test_compute_ab_stats_no_data(db_session):
    stats = compute_ab_stats(db_session)
    assert stats["total_events"] == 0
    assert stats["best_algorithm"] is None
    assert stats["winner_significant"] is False
    assert stats["default_algorithm"] == 3
    # All three algorithms still reported as rows.
    assert {r["algorithm"] for r in stats["rows"]} == {1, 2, 3}


def test_promote_and_read_default(db_session):
    assert get_default_algorithm(db_session) == 3
    set_default_algorithm(db_session, 1)
    assert get_default_algorithm(db_session) == 1
    # Persisted on the singleton row.
    row = db_session.query(ABConfig).first()
    assert row is not None and row.default_algorithm == 1


def test_set_default_rejects_invalid(db_session):
    import pytest as _pytest
    with _pytest.raises(ValueError):
        set_default_algorithm(db_session, 99)


def test_promote_endpoint_requires_superuser(client, auth_headers):
    # Authenticated but non-superuser user must be rejected with 403.
    r = client.post("/api/ab/promote", params={"algorithm": 1}, headers=auth_headers)
    assert r.status_code == 403


def test_record_event_endpoint(client, db_session, auth_headers):
    """POST /api/ab/event records an interaction event."""
    payload = {
        "algorithm": 1,
        "source_music_id": 1,
        "recommended_music_id": 2,
        "event_type": "click",
    }
    r = client.post("/api/ab/event", json=payload, headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["algorithm"] == 1
    assert data["event_type"] == "click"
    assert "id" in data


def test_promote_endpoint_as_superuser(client, db_session):
    su = _make_user(db_session, superuser=True)
    db_session.commit()
    # Build auth headers for the superuser manually.
    from app.utils.auth import create_access_token
    from app.database import get_settings
    token = create_access_token(
        data={"sub": su.username},
        expires_delta=None,
    )
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post("/api/ab/promote", params={"algorithm": 2}, headers=headers)
    assert r.status_code == 200
    assert r.json()["default_algorithm"] == 2

    # Default endpoint reflects the promotion.
    r2 = client.get("/api/ab/default", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["default_algorithm"] == 2
