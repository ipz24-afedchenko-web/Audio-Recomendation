"""
Smoke tests for the music upload / list / delete routes, including the
new magic-bytes file validation AND the per-user dedup-by-content-hash.
"""

import io
import os


def _make_mp3_bytes(payload: bytes = b"") -> bytes:
    # Valid ID3v2 header + a tiny payload (we never actually decode it).
    return b"ID3\x04\x00\x00\x00\x00\x00\x00" + (payload or b"\x00" * 64)


def _upload(client, headers, *, name="track.mp3", content=None, title="My Track", artist="Tester", genre="rock"):
    content = content if content is not None else _make_mp3_bytes()
    files = {"file": (name, io.BytesIO(content), "audio/mpeg")}
    data = {"title": title}
    if artist is not None:
        data["artist"] = artist
    if genre is not None:
        data["genre"] = genre
    return client.post("/api/music/upload", files=files, data=data, headers=headers)


def test_upload_requires_auth(client):
    files = {"file": ("t.mp3", io.BytesIO(_make_mp3_bytes()), "audio/mpeg")}
    r = client.post("/api/music/upload", files=files, data={"title": "x"})
    assert r.status_code == 401


def test_upload_accepts_valid_mp3(client, auth_headers, uploads_dir):
    r = _upload(client, auth_headers, title="Track 1")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "Track 1"
    assert body["artist"] == "Tester"
    assert body["genre"] == "rock"
    assert body["id"] > 0


def test_upload_rejects_wrong_extension(client, auth_headers):
    content = b"not audio at all"
    r = _upload(client, auth_headers, name="song.txt", content=content)
    assert r.status_code == 400
    assert "not allowed" in r.json()["detail"].lower()


def test_upload_rejects_renamed_non_audio(client, auth_headers):
    """A .mp3 file with plain text body must be rejected by magic-bytes check."""
    r = _upload(client, auth_headers, name="fake.mp3", content=b"hello, this is text")
    assert r.status_code == 400
    assert "magic bytes" in r.json()["detail"].lower()


def test_upload_rejects_empty_file(client, auth_headers):
    r = _upload(client, auth_headers, name="empty.mp3", content=b"")
    assert r.status_code == 400


def test_list_user_music(client, auth_headers):
    _upload(client, auth_headers, name="a.mp3", content=_make_mp3_bytes(b"AAA"), title="A")
    _upload(client, auth_headers, name="b.mp3", content=_make_mp3_bytes(b"BBB"), title="B")
    me = client.get("/api/auth/me", headers=auth_headers).json()
    r = client.get(f"/api/music/user/{me['id']}", headers=auth_headers)
    assert r.status_code == 200
    titles = {m["title"] for m in r.json()}
    assert {"A", "B"}.issubset(titles)


def test_user_cannot_list_other_users_music(client, auth_headers):
    me = client.get("/api/auth/me", headers=auth_headers).json()
    r = client.get(f"/api/music/user/{me['id'] + 9999}", headers=auth_headers)
    assert r.status_code == 403


def test_delete_removes_music(client, auth_headers, uploads_dir):
    create = _upload(client, auth_headers, title="Doomed")
    music_id = create.json()["id"]

    r = client.delete(f"/api/music/{music_id}", headers=auth_headers)
    assert r.status_code == 204

    me = client.get("/api/auth/me", headers=auth_headers).json()
    listing = client.get(f"/api/music/user/{me['id']}", headers=auth_headers).json()
    assert all(m["id"] != music_id for m in listing)


# ---------------------------------------------------------------------------
# Deduplication (per-user, by SHA-256 content hash)
# ---------------------------------------------------------------------------

def test_upload_response_carries_file_hash_and_status(client, auth_headers):
    r = _upload(client, auth_headers, title="T")
    body = r.json()
    assert body["file_hash"] is not None
    assert len(body["file_hash"]) == 64  # SHA-256 hex
    # Status starts as "pending" — the BackgroundTask flips it later.
    assert body["analysis_status"] in ("pending", "analyzing", "ready")


def test_duplicate_content_is_rejected_with_409(client, auth_headers):
    """Uploading the same bytes twice yields 409 the second time."""
    payload = b"some-mp3-content-1"
    a = _upload(client, auth_headers, name="one.mp3", content=_make_mp3_bytes(payload), title="First")
    assert a.status_code == 201

    b = _upload(client, auth_headers, name="two.mp3", content=_make_mp3_bytes(payload), title="Second")
    assert b.status_code == 409
    detail = b.json()["detail"]
    assert "First" in detail
    assert "already" in detail.lower()


def test_different_content_passes(client, auth_headers):
    """Different bytes → different hash → both succeed."""
    a = _upload(client, auth_headers, name="a.mp3", content=_make_mp3_bytes(b"AAA"), title="A")
    b = _upload(client, auth_headers, name="b.mp3", content=_make_mp3_bytes(b"BBB"), title="B")
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["file_hash"] != b.json()["file_hash"]


def test_duplicate_under_different_filename_still_blocked(client, auth_headers):
    """Renaming a duplicate does not bypass the hash check."""
    content = _make_mp3_bytes(b"same-bytes")
    a = _upload(client, auth_headers, name="original.mp3", content=content, title="Orig")
    b = _upload(client, auth_headers, name="renamed.mp3", content=content, title="Renamed")
    assert a.status_code == 201
    assert b.status_code == 409


def test_duplicate_orphan_file_is_removed(client, auth_headers, uploads_dir):
    """The 409 path must not leave the duplicate file on disk."""
    content = _make_mp3_bytes(b"orphan-test")
    _upload(client, auth_headers, name="first.mp3", content=content, title="First")
    before = set(os.listdir(uploads_dir) for _ in [0]) if False else None  # noqa: F841

    import os as _os
    files_before = set(_os.listdir(uploads_dir))
    r = _upload(client, auth_headers, name="dup.mp3", content=content, title="Dup")
    assert r.status_code == 409
    files_after = set(_os.listdir(uploads_dir))
    assert files_after == files_before, "Duplicate upload should not leave a file on disk"
