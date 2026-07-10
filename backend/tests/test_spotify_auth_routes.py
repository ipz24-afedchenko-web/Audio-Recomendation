import pytest
from unittest.mock import patch
from datetime import datetime, timezone


def test_auth_login_returns_url(client, auth_headers):
    r = client.get("/api/spotify/auth/login", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "url" in data
    assert "accounts.spotify.com/authorize" in data["url"]


def test_auth_status_not_connected(client, auth_headers):
    r = client.get("/api/spotify/auth/status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"connected": False}


def test_auth_login_requires_auth(client):
    r = client.get("/api/spotify/auth/login")
    assert r.status_code in (401, 403)


def test_auth_status_requires_auth(client):
    r = client.get("/api/spotify/auth/status")
    assert r.status_code in (401, 403)


def test_auth_callback_requires_auth(client):
    r = client.post("/api/spotify/auth/callback", json={"code": "xxx"})
    assert r.status_code in (401, 403)


def test_auth_callback_stores_tokens(client, auth_headers, db_session):
    fake_token_response = {
        "access_token": "mock-spotify-access",
        "refresh_token": "mock-spotify-refresh",
        "expires_in": 3600,
        "scope": "streaming user-read-email",
    }

    with patch("httpx.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = fake_token_response

        r = client.post(
            "/api/spotify/auth/callback",
            json={"code": "auth-code-123"},
            headers=auth_headers,
        )

    assert r.status_code == 200
    assert r.json() == {"ok": True}

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == "https://accounts.spotify.com/api/token"
    assert kwargs["data"]["grant_type"] == "authorization_code"
    assert kwargs["data"]["code"] == "auth-code-123"

    from app.models.spotify_auth import SpotifyAuth

    row = db_session.query(SpotifyAuth).first()
    assert row is not None
    assert row.access_token == "mock-spotify-access"
    assert row.refresh_token == "mock-spotify-refresh"
    assert row.scope == "streaming user-read-email"


def test_auth_status_connected(client, auth_headers, db_session):
    from app.models.spotify_auth import SpotifyAuth
    from app.models.user import User
    from app.database import get_db

    user = db_session.query(User).first()
    expires_at = int(datetime.now(timezone.utc).timestamp()) + 3600
    auth = SpotifyAuth(
        user_id=user.id,
        access_token="existing-token",
        refresh_token="existing-refresh",
        expires_at=expires_at,
    )
    db_session.add(auth)
    db_session.commit()

    r = client.get("/api/spotify/auth/status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"connected": True}


def test_auth_status_expired_returns_not_connected(client, auth_headers, db_session):
    from app.models.spotify_auth import SpotifyAuth
    from app.models.user import User

    user = db_session.query(User).first()
    expires_at = int(datetime.now(timezone.utc).timestamp()) - 3600
    auth = SpotifyAuth(
        user_id=user.id,
        access_token="expired-token",
        refresh_token="expired-refresh",
        expires_at=expires_at,
    )
    db_session.add(auth)
    db_session.commit()

    r = client.get("/api/spotify/auth/status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"connected": False}


def test_auth_player_token_requires_auth(client):
    r = client.get("/api/spotify/auth/player-token")
    assert r.status_code in (401, 403)


def test_auth_player_token_returns_token(client, auth_headers, db_session):
    from app.models.spotify_auth import SpotifyAuth
    from app.models.user import User

    user = db_session.query(User).first()
    expires_at = int(datetime.now(timezone.utc).timestamp()) + 3600
    auth = SpotifyAuth(
        user_id=user.id,
        access_token="valid-token",
        refresh_token="valid-refresh",
        expires_at=expires_at,
    )
    db_session.add(auth)
    db_session.commit()

    r = client.get("/api/spotify/auth/player-token", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"token": "valid-token"}


def test_auth_player_token_refreshes_when_expired(client, auth_headers, db_session):
    from app.models.spotify_auth import SpotifyAuth
    from app.models.user import User

    user = db_session.query(User).first()
    expires_at = int(datetime.now(timezone.utc).timestamp()) - 3600
    auth = SpotifyAuth(
        user_id=user.id,
        access_token="expired-token",
        refresh_token="valid-refresh",
        expires_at=expires_at,
    )
    db_session.add(auth)
    db_session.commit()

    fake_refresh_response = {
        "access_token": "refreshed-token",
        "expires_in": 3600,
        "scope": "streaming user-read-email",
    }

    with patch("httpx.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = fake_refresh_response

        r = client.get("/api/spotify/auth/player-token", headers=auth_headers)

    assert r.status_code == 200
    assert r.json() == {"token": "refreshed-token"}

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == "https://accounts.spotify.com/api/token"
    assert kwargs["data"]["grant_type"] == "refresh_token"
    assert kwargs["data"]["refresh_token"] == "valid-refresh"

    db_session.refresh(auth)
    assert auth.access_token == "refreshed-token"


def test_auth_callback_upserts_existing_token(client, auth_headers, db_session):
    from app.models.spotify_auth import SpotifyAuth
    from app.models.user import User

    user = db_session.query(User).first()
    existing = SpotifyAuth(
        user_id=user.id,
        access_token="old-access",
        refresh_token="old-refresh",
        expires_at=12345,
        scope="old-scope",
    )
    db_session.add(existing)
    db_session.commit()

    old_id = existing.id

    fake_token_response = {
        "access_token": "new-access",
        "refresh_token": "new-refresh",
        "expires_in": 3600,
        "scope": "streaming",
    }

    with patch("httpx.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = fake_token_response

        r = client.post(
            "/api/spotify/auth/callback",
            json={"code": "new-code"},
            headers=auth_headers,
        )

    assert r.status_code == 200
    assert r.json() == {"ok": True}

    rows = db_session.query(SpotifyAuth).all()
    assert len(rows) == 1
    assert rows[0].id == old_id
    assert rows[0].access_token == "new-access"
    assert rows[0].refresh_token == "new-refresh"


def test_auth_player_token_no_auth_returns_404(client, auth_headers):
    r = client.get("/api/spotify/auth/player-token", headers=auth_headers)
    assert r.status_code == 404
    assert "not connected" in r.json()["detail"].lower()


def test_callback_token_exchange_fails_502(client, auth_headers):
    with patch("httpx.post") as mock_post:
        mock_post.return_value.status_code = 400

        r = client.post(
            "/api/spotify/auth/callback",
            json={"code": "bad-code"},
            headers=auth_headers,
        )

    assert r.status_code == 502
    assert "token exchange" in r.json()["detail"].lower()


def test_player_token_refresh_fails_502(client, auth_headers, db_session):
    from datetime import datetime, timezone
    from app.models.spotify_auth import SpotifyAuth
    from app.models.user import User

    user = db_session.query(User).first()
    expires_at = int(datetime.now(timezone.utc).timestamp()) - 3600
    auth = SpotifyAuth(
        user_id=user.id,
        access_token="old-token",
        refresh_token="will-fail",
        expires_at=expires_at,
    )
    db_session.add(auth)
    db_session.commit()

    with patch("httpx.post") as mock_post:
        mock_post.return_value.status_code = 400

        r = client.get("/api/spotify/auth/player-token", headers=auth_headers)

    assert r.status_code == 502
    assert "token refresh" in r.json()["detail"].lower()


def test_callback_upsert(client, auth_headers, db_session):
    from app.models.spotify_auth import SpotifyAuth

    fake_response = {
        "access_token": "token-1",
        "refresh_token": "refresh-1",
        "expires_in": 3600,
        "scope": "streaming",
    }

    with patch("httpx.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = fake_response

        r1 = client.post(
            "/api/spotify/auth/callback",
            json={"code": "code-1"},
            headers=auth_headers,
        )
        assert r1.status_code == 200

        r2 = client.post(
            "/api/spotify/auth/callback",
            json={"code": "code-2"},
            headers=auth_headers,
        )
        assert r2.status_code == 200

    rows = db_session.query(SpotifyAuth).all()
    assert len(rows) == 1
    assert rows[0].access_token == "token-1"
