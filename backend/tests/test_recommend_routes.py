"""
Integration tests for the recommendation + A/B endpoints (W4-6).

Exercises the route layer end-to-end (auth, error paths, A/B event
recording, significance stats, and the promoted default-algorithm
resolution) on the SQLite test DB.  Coverage for ``routes/recommend.py``
was the single biggest gap before these tests.
"""

import io

from app.models.user import User
from app.models.music import Music
from app.models.audio_features import AudioFeatures
from app.utils.auth import create_access_token


def _auth_headers_for(db_session, username, superuser=False):
    u = User(
        email=f"{username}@x.com", username=username,
        hashed_password="x", is_active=True, is_superuser=superuser,
    )
    db_session.add(u)
    db_session.commit()
    token = create_access_token(data={"sub": username}, expires_delta=None)
    return {"Authorization": f"Bearer {token}"}, u


def _seed_analyzed_track(db_session, user, *, title, genre=None, tempo=120.0, energy=0.5):
    m = Music(
        title=title, user_id=user.id, file_path=f"/dev/null/{title}.mp3",
        genre=genre,
    )
    db_session.add(m)
    db_session.flush()
    af = AudioFeatures(
        music_id=m.id, tempo=tempo, key=0, mode=1, energy=energy,
        valence=0.5, loudness=-10.0, spectral_centroid_mean=2000.0,
        mfcc_mean=[0.0] * 20,
    )
    db_session.add(af)
    db_session.commit()
    return m


def _mp3():
    return b"ID3\x04\x00\x00\x00\x00\x00" + b"\x00" * 64


def test_recommend_requires_auth(client):
    r = client.get("/api/recommend/1")
    assert r.status_code == 401


def test_recommend_404_for_missing_music(client, auth_headers):
    r = client.get("/api/recommend/99999", headers=auth_headers)
    assert r.status_code == 404


def test_recommend_400_for_unanalyzed(client, db_session, auth_headers):
    headers, user = _auth_headers_for(db_session, "rec-u1")
    m = Music(title="no-af", user_id=user.id, file_path="/dev/null/x.mp3")
    db_session.add(m)
    db_session.commit()
    r = client.get(f"/api/recommend/{m.id}", headers=headers)
    assert r.status_code == 400


def test_recommend_returns_list_for_analyzed(client, db_session, auth_headers):
    headers, user = _auth_headers_for(db_session, "rec-u2")
    for i in range(4):
        _seed_analyzed_track(db_session, user, title=f"t{i}", tempo=100.0 + i * 5)
    first = db_session.query(Music).filter_by(title="t0").first()
    r = client.get(f"/api/recommend/{first.id}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    assert all("recommended_music" in item for item in body)


def test_recommend_ab_test_records_impressions(client, db_session, auth_headers):
    headers, user = _auth_headers_for(db_session, "rec-u3")
    for i in range(3):
        _seed_analyzed_track(db_session, user, title=f"ab{i}")
    src = db_session.query(Music).filter_by(title="ab0").first()

    r = client.get(
        f"/api/recommend/{src.id}", headers=headers,
        params={"ab_test": True},
    )
    assert r.status_code == 200

    # Impressions should have been recorded for the source's algorithm.
    stats = client.get("/api/ab/stats", headers=headers).json()
    assert stats["total_events"] >= 1
    total_impressions = sum(row["impressions"] for row in stats["rows"])
    assert total_impressions >= 1


def test_recommend_omitted_algorithm_uses_default(client, db_session, auth_headers):
    """When ``algorithm`` is omitted it resolves from the promoted default."""
    from app.services.ab_stats import set_default_algorithm
    headers, user = _auth_headers_for(db_session, "rec-u4")
    for i in range(3):
        _seed_analyzed_track(db_session, user, title=f"d{i}")
    set_default_algorithm(db_session, 2)  # promote cosine
    src = db_session.query(Music).filter_by(title="d0").first()

    r = client.get(f"/api/recommend/{src.id}", headers=headers)
    assert r.status_code == 200
    # Every returned row used the promoted algorithm (2).
    for item in r.json():
        assert item["algorithm"] == 2


def test_recommend_explicit_algorithm_wins(client, db_session, auth_headers):
    """An explicit algorithm param is never overridden by the default."""
    from app.services.ab_stats import set_default_algorithm
    headers, user = _auth_headers_for(db_session, "rec-u5")
    for i in range(3):
        _seed_analyzed_track(db_session, user, title=f"e{i}")
    set_default_algorithm(db_session, 1)
    src = db_session.query(Music).filter_by(title="e0").first()

    r = client.get(
        f"/api/recommend/{src.id}", headers=headers,
        params={"algorithm": 3},
    )
    assert r.status_code == 200
    for item in r.json():
        assert item["algorithm"] == 3


def test_recommend_history_endpoint(client, db_session, auth_headers):
    headers, user = _auth_headers_for(db_session, "rec-u6")
    for i in range(3):
        _seed_analyzed_track(db_session, user, title=f"h{i}")
    src = db_session.query(Music).filter_by(title="h0").first()
    client.get(f"/api/recommend/{src.id}", headers=headers)

    r = client.get(f"/api/recommend/user/{user.id}", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_recommend_user_cannot_see_other_history(client, db_session, auth_headers):
    headers_a, user_a = _auth_headers_for(db_session, "rec-ua")
    headers_b, user_b = _auth_headers_for(db_session, "rec-ub")
    r = client.get(f"/api/recommend/user/{user_a.id}", headers=headers_b)
    assert r.status_code == 403
