"""
Smoke tests for the analyze route.  We do NOT call librosa in these
tests (no audio fixtures, no ffmpeg dependency) — we only exercise the
authorization / error paths and the GET side of the endpoint.
"""

import io


def _make_mp3_bytes() -> bytes:
    return b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 64


def _upload_one(client, headers, title="T"):
    files = {"file": ("t.mp3", io.BytesIO(_make_mp3_bytes()), "audio/mpeg")}
    return client.post(
        "/api/music/upload",
        files=files,
        data={"title": title},
        headers=headers,
    ).json()


def test_analyze_requires_auth(client):
    r = client.post("/api/analyze/1")
    assert r.status_code == 401


def test_analyze_returns_404_for_missing_music(client, auth_headers):
    r = client.post("/api/analyze/99999", headers=auth_headers)
    assert r.status_code == 404


def test_get_features_returns_404_for_missing_music(client, auth_headers):
    r = client.get("/api/analyze/features/99999", headers=auth_headers)
    assert r.status_code == 404


def test_get_features_returns_404_when_not_analyzed(client, auth_headers):
    """A freshly uploaded track has no AudioFeatures row yet."""
    track = _upload_one(client, auth_headers)
    r = client.get(f"/api/analyze/features/{track['id']}", headers=auth_headers)
    assert r.status_code == 404
    assert "Run analysis first" in r.json()["detail"]


def test_cannot_analyze_someone_elses_track(client, auth_headers):
    """Authorization: user A cannot analyze user B's track."""
    track = _upload_one(client, auth_headers)

    # Register and log in a second user.
    client.post(
        "/api/auth/register",
        json={"email": "b@x.com", "username": "bob", "password": "supersecret123"},
    )
    bob_login = client.post(
        "/api/auth/login",
        data={"username": "bob", "password": "supersecret123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    bob_headers = {"Authorization": f"Bearer {bob_login.json()['access_token']}"}

    r = client.post(f"/api/analyze/{track['id']}", headers=bob_headers)
    assert r.status_code == 403
