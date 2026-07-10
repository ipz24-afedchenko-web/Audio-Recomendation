import pytest
from datetime import datetime, timezone

from app.models.spotify_auth import SpotifyAuth
from app.models.user import User


def test_settings_has_spotify_redirect_uri(client):
    from app.database import get_settings

    s = get_settings()
    assert hasattr(s, "spotify_redirect_uri")
    assert s.spotify_redirect_uri == "http://127.0.0.1:3000/callback"


def test_spotify_auth_model_table_name():
    assert SpotifyAuth.__tablename__ == "spotify_auth"


def test_spotify_auth_columns_exist(client):
    expected = {"id", "user_id", "access_token", "refresh_token", "expires_at",
                "scope", "created_at", "updated_at"}
    mapper = SpotifyAuth.__mapper__
    cols = {c.name for c in mapper.columns}
    assert expected.issubset(cols), f"Missing columns: {expected - cols}"


def test_spotify_auth_user_relationship(client):
    mapper = SpotifyAuth.__mapper__
    rels = {r.key for r in mapper.relationships}
    assert "user" in rels


def test_user_has_spotify_auth_relationship(client):
    mapper = User.__mapper__
    rels = {r.key for r in mapper.relationships}
    assert "spotify_auth" in rels


def test_create_spotify_auth(db_session):
    user = User(
        email="spotify-auth@example.com",
        username="spotifyuser",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    auth = SpotifyAuth(
        user_id=user.id,
        access_token="mock-access-token",
        refresh_token="mock-refresh-token",
        expires_at=9999999999,
    )
    db_session.add(auth)
    db_session.flush()

    assert auth.id is not None
    assert auth.user_id == user.id


def test_spotify_auth_cascade_delete(db_session):
    user = User(
        email="cascade-test@example.com",
        username="cascadetest",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    auth = SpotifyAuth(
        user_id=user.id,
        access_token="token",
        refresh_token="refresh",
        expires_at=9999999999,
    )
    db_session.add(auth)
    db_session.flush()

    auth_id = auth.id
    db_session.delete(user)
    db_session.flush()

    assert db_session.get(SpotifyAuth, auth_id) is None


def test_spotify_auth_unique_user_id(db_session):
    user = User(
        email="unique-test@example.com",
        username="uniquetest",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    auth1 = SpotifyAuth(
        user_id=user.id,
        access_token="token1",
        refresh_token="refresh1",
        expires_at=9999999999,
    )
    db_session.add(auth1)
    db_session.flush()

    auth2 = SpotifyAuth(
        user_id=user.id,
        access_token="token2",
        refresh_token="refresh2",
        expires_at=9999999999,
    )
    db_session.add(auth2)
    with pytest.raises(Exception):
        db_session.flush()
