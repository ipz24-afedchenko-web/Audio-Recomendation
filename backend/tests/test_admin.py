"""
Tests for W4-3: admin dashboard endpoint.
"""

import pytest

from app.models.user import User


def _superuser(db_session):
    su = User(
        email="admin@x.com", username="adminuser",
        hashed_password="x", is_active=True, is_superuser=True,
    )
    db_session.add(su)
    db_session.commit()
    from app.utils.auth import create_access_token
    token = create_access_token(data={"sub": su.username}, expires_delta=None)
    return {"Authorization": f"Bearer {token}"}


def test_admin_stats_requires_superuser(client):
    r = client.get("/api/admin/stats")
    assert r.status_code == 401


def test_admin_stats_forbidden_for_regular_user(client, auth_headers):
    r = client.get("/api/admin/stats", headers=auth_headers)
    assert r.status_code == 403


def test_admin_stats_returns_counts_and_ab(client, db_session):
    headers = _superuser(db_session)
    r = client.get("/api/admin/stats", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "user_count" in body
    assert "music_count" in body
    assert "analyzed_count" in body
    assert "ab" in body
    assert "rows" in body["ab"]
    assert body["user_count"] >= 1  # the superuser we created


def test_user_response_includes_is_superuser(client, db_session):
    headers = _superuser(db_session)
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["is_superuser"] is True
