"""
Additional route-layer tests (W4-6) covering paths that were
previously unexercised: analyzed-features GET, music PUT/GET,
and the recommend train / clusters endpoints.
"""

import io

from app.models.music import Music
from app.models.audio_features import AudioFeatures


def _auth(db_session, username):
    from app.models.user import User
    from app.utils.auth import create_access_token
    u = User(email=f"{username}@x.com", username=username,
            hashed_password="x", is_active=True)
    db_session.add(u)
    db_session.commit()
    token = create_access_token(data={"sub": username}, expires_delta=None)
    return {"Authorization": f"Bearer {token}"}, u


def _seed_analyzed(db_session, user, title):
    m = Music(title=title, user_id=user.id, file_path=f"/dev/null/{title}.mp3")
    db_session.add(m)
    db_session.flush()
    af = AudioFeatures(
        music_id=m.id, tempo=120.0, key=0, mode=1, energy=0.5,
        valence=0.5, loudness=-10.0, spectral_centroid_mean=2000.0,
        mfcc_mean=[0.0] * 20,
    )
    db_session.add(af)
    db_session.commit()
    return m


def test_get_features_for_analyzed(client, db_session, auth_headers):
    headers, user = _auth(db_session, "feat1")
    m = _seed_analyzed(db_session, user, "f1")
    r = client.get(f"/api/analyze/features/{m.id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["tempo"] == 120.0


def test_put_music_updates_fields(client, db_session, auth_headers):
    headers, user = _auth(db_session, "put1")
    m = Music(title="old", user_id=user.id, file_path="/dev/null/p.mp3")
    db_session.add(m)
    db_session.commit()

    r = client.put(
        f"/api/music/{m.id}",
        json={"title": "new", "artist": "A", "genre": "jazz"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["title"] == "new"
    assert r.json()["genre"] == "jazz"


def test_put_music_forbidden_for_other(client, db_session, auth_headers):
    headers_a, user_a = _auth(db_session, "put-a")
    headers_b, _ = _auth(db_session, "put-b")
    m = Music(title="x", user_id=user_a.id, file_path="/dev/null/x.mp3")
    db_session.add(m)
    db_session.commit()
    r = client.put(
        f"/api/music/{m.id}", json={"title": "hack"}, headers=headers_b,
    )
    assert r.status_code == 403


def test_get_single_music_and_404(client, db_session, auth_headers):
    headers, user = _auth(db_session, "get1")
    m = Music(title="g", user_id=user.id, file_path="/dev/null/g.mp3")
    db_session.add(m)
    db_session.commit()

    r = client.get(f"/api/music/{m.id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["title"] == "g"

    r2 = client.get("/api/music/99999", headers=headers)
    assert r2.status_code == 404


def test_analyze_music_returns_500_on_failure(client, db_session, auth_headers):
    """When run_analysis returns False, POST /api/analyze/{id} returns 500."""
    headers, user = _auth(db_session, "anafail")
    m = Music(title="failme", user_id=user.id, file_path="/dev/null/missing.mp3")
    db_session.add(m)
    db_session.commit()

    r = client.post(f"/api/analyze/{m.id}", headers=headers)
    assert r.status_code == 500


def test_analyze_music_forbidden_for_other(client, db_session, auth_headers):
    """Users cannot trigger analysis on someone else's track."""
    headers_a, user_a = _auth(db_session, "ana-a")
    headers_b, _ = _auth(db_session, "ana-b")
    m = Music(title="other-track", user_id=user_a.id, file_path="/dev/null/other.mp3")
    db_session.add(m)
    db_session.commit()

    r = client.post(f"/api/analyze/{m.id}", headers=headers_b)
    assert r.status_code == 403


def test_get_features_forbidden_for_other(client, db_session, auth_headers):
    """GET /api/analyze/features/{id} returns 403 for another user's track."""
    headers_a, user_a = _auth(db_session, "gfa-a")
    m = Music(title="gfa-track", user_id=user_a.id, file_path="/dev/null/gfa.mp3")
    db_session.add(m)
    db_session.commit()

    headers_b, _ = _auth(db_session, "gfa-b")
    r = client.get(f"/api/analyze/features/{m.id}", headers=headers_b)
    assert r.status_code == 403


def test_recommend_train_and_clusters(client, db_session, auth_headers):
    headers, user = _auth(db_session, "tr1")
    for i in range(6):
        _seed_analyzed(db_session, user, f"tr{i}")

    rt = client.post("/api/recommend/train?n_clusters=3", headers=headers)
    assert rt.status_code == 200
    assert rt.json()["status"] == "success"
    assert rt.json()["n_clusters"] == 3

    rc = client.get("/api/recommend/clusters", headers=headers)
    assert rc.status_code == 200
    assert rc.json()["status"] == "ok"
    assert rc.json()["n_clusters"] >= 1
