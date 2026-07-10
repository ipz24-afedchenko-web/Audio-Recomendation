import os
import tempfile


def test_stream_requires_auth(client):
    r = client.get("/api/music/1/stream")
    assert r.status_code in (401, 403)


def test_stream_nonexistent_track(client, auth_headers):
    r = client.get("/api/music/99999/stream", headers=auth_headers)
    assert r.status_code == 404


def test_stream_success_200(client, auth_headers, db_session):
    from app.database import get_settings
    from app.models.music import Music
    from app.models.user import User

    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.write(b"\x00\x01\x02\x03" * 256)
    tmp.close()

    settings = get_settings()
    dest = os.path.join(settings.upload_dir, os.path.basename(tmp.name))
    os.rename(tmp.name, dest)

    user = db_session.query(User).first()
    track = Music(
        user_id=user.id,
        title="Stream Test",
        file_path=dest,
        analysis_status="ready",
    )
    db_session.add(track)
    db_session.commit()

    r = client.get(f"/api/music/{track.id}/stream", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers.get("accept-ranges") == "bytes"

    if os.path.exists(dest):
        os.remove(dest)


def test_stream_spotify_track_404(client, auth_headers, db_session):
    from app.models.music import Music, SOURCE_SPOTIFY
    from app.models.user import User

    user = db_session.query(User).first()
    track = Music(
        user_id=user.id,
        title="Spotify Track",
        source=SOURCE_SPOTIFY,
        external_id="abc123",
        analysis_status="ready",
    )
    db_session.add(track)
    db_session.commit()

    r = client.get(f"/api/music/{track.id}/stream", headers=auth_headers)
    assert r.status_code == 404


def test_stream_forbidden_other_user(client, auth_headers, db_session):
    from app.models.music import Music
    from app.models.user import User

    client.post("/api/auth/register", json={
        "email": "other@example.com",
        "username": "otheruser",
        "password": "secret123",
    })

    other_user = db_session.query(User).filter(User.email == "other@example.com").first()
    track = Music(
        user_id=other_user.id,
        title="Other's Track",
        file_path="/tmp/nonexistent.mp3",
        analysis_status="ready",
    )
    db_session.add(track)
    db_session.commit()

    r = client.get(f"/api/music/{track.id}/stream", headers=auth_headers)
    assert r.status_code == 403


def test_stream_range_206(client, auth_headers, db_session):
    from app.database import get_settings
    from app.models.music import Music
    from app.models.user import User

    content = b"\x00\x01\x02\x03" * 512
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.write(content)
    tmp.close()

    settings = get_settings()
    dest = os.path.join(settings.upload_dir, os.path.basename(tmp.name))
    os.rename(tmp.name, dest)

    user = db_session.query(User).first()
    track = Music(
        user_id=user.id,
        title="Range Test",
        file_path=dest,
        analysis_status="ready",
    )
    db_session.add(track)
    db_session.commit()

    r = client.get(
        f"/api/music/{track.id}/stream",
        headers={**auth_headers, "Range": "bytes=0-99"},
    )
    assert r.status_code == 206
    assert r.headers.get("accept-ranges") == "bytes"
    assert r.headers.get("content-range") == "bytes 0-99/2048"

    if os.path.exists(dest):
        os.remove(dest)
