import pytest
from unittest.mock import patch

from fastapi.testclient import TestClient


def _fake_track(track_id="abc123"):
    return {
        "spotify_track_id": track_id,
        "title": "Neon Sky",
        "artist": "Test Artist",
        "album": "Test Album",
        "duration_ms": 210000,
        "preview_url": "https://p.scdn.co/mp3/preview/x",
        "external_uri": f"spotify:track:{track_id}",
        "external_url": f"https://open.spotify.com/track/{track_id}",
        "image_url": "https://i.scdn.co/image/x",
    }


def _fake_features():
    return {
        "tempo": 120.0,
        "key": 5,
        "mode": 1,
        "energy": 0.8,
        "valence": 0.6,
        "danceability": 0.7,
        "acousticness": 0.2,
        "loudness": -7.0,
        "instrumentalness": 0.0,
        "liveness": 0.1,
        "speechiness": 0.05,
    }


def _spotify_enabled(client: TestClient, auth_headers: dict) -> None:
    # Ensure the Spotify router sees credentials as enabled.
    with patch("app.services.spotify.get_settings") as mock_settings:
        from app.database import get_settings

        real = get_settings()
        mock_settings.return_value = real
        mock_settings.return_value.spotify_enabled = True
        yield


@pytest.fixture
def spotify_client_mock():
    with patch("app.routes.spotify.get_spotify_client") as mock_get:
        from app.services.spotify import SpotifyClient

        client = mock_get.return_value
        client.search.return_value = [_fake_track()]
        client.get_track.return_value = _fake_track()
        client.get_audio_features.return_value = _fake_features()
        # Use the real mapping so the persisted AudioFeatures carry the
        # expected (approximate) values and feature_origin='spotify'.
        client.map_to_features.return_value = SpotifyClient().map_to_features(
            _fake_track(), _fake_features()
        )
        yield client


def test_spotify_search_requires_auth(client: TestClient):
    r = client.get("/api/spotify/search?q=test")
    assert r.status_code in (401, 403)


def test_spotify_search_disabled_returns_503(
    client: TestClient, auth_headers: dict
):
    with patch("app.routes.spotify.settings") as mock_settings:
        mock_settings.spotify_enabled = False
        r = client.get(
            "/api/spotify/search?q=test", headers=auth_headers
        )
    assert r.status_code == 503


def test_spotify_search_returns_results(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    with patch("app.routes.spotify.settings") as mock_settings:
        mock_settings.spotify_enabled = True
        r = client.get(
            "/api/spotify/search?q=neon", headers=auth_headers
        )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 1
    assert data[0]["title"] == "Neon Sky"
    assert data[0]["spotify_track_id"] == "abc123"


def test_add_spotify_creates_ready_track(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    with patch("app.routes.spotify.settings") as mock_settings:
        mock_settings.spotify_enabled = True
        r = client.post(
            "/api/spotify/add",
            json={"spotify_track_id": "abc123"},
            headers=auth_headers,
        )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["source"] == "spotify"
    assert body["external_id"] == "abc123"
    assert body["preview_url"] == "https://p.scdn.co/mp3/preview/x"
    assert body["analysis_status"] == "ready"

    # The AudioFeatures row exists with spotify origin.
    features = client.get(
        f"/api/analyze/features/{body['id']}", headers=auth_headers
    )
    assert features.status_code == 200, features.text
    assert features.json()["feature_origin"] == "spotify"
    assert features.json()["tempo"] == 120.0

    # Catalog tracks cannot be re-analyzed locally (no file).
    reanalyze = client.post(
        f"/api/analyze/{body['id']}", headers=auth_headers
    )
    assert reanalyze.status_code == 409


def test_add_spotify_persists_cover_url(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    """The /add route must persist album.images[0].url as cover_url."""
    with patch("app.routes.spotify.settings") as mock_settings:
        mock_settings.spotify_enabled = True
        r = client.post(
            "/api/spotify/add",
            json={"spotify_track_id": "abc123"},
            headers=auth_headers,
        )
    assert r.status_code == 201, r.text
    body = r.json()
    # _fake_track() carries image_url="https://i.scdn.co/image/x"
    assert body["cover_url"] == "https://i.scdn.co/image/x"


def test_add_spotify_duplicate_returns_409(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    with patch("app.routes.spotify.settings") as mock_settings:
        mock_settings.spotify_enabled = True
        first = client.post(
            "/api/spotify/add",
            json={"spotify_track_id": "abc123"},
            headers=auth_headers,
        )
        assert first.status_code == 201
        second = client.post(
            "/api/spotify/add",
            json={"spotify_track_id": "abc123"},
            headers=auth_headers,
        )
    assert second.status_code == 409


def test_health_probe_true_when_api_reachable():
    from app.services import spotify as spotify_svc

    spotify_svc.reset_spotify_health_for_testing()
    fake = spotify_svc.SpotifyClient()
    fake.search = lambda q, limit=1: [_fake_track()]
    fake._get_token = lambda: "tok"  # noqa: SLF001
    with patch.object(spotify_svc, "get_spotify_client", return_value=fake):
        assert spotify_svc.is_spotify_healthy(force=True) is True


def test_health_probe_false_when_api_fails():
    from app.services import spotify as spotify_svc

    spotify_svc.reset_spotify_health_for_testing()
    fake = spotify_svc.SpotifyClient()
    fake.search = lambda q, limit=1: (_ for _ in ()).throw(Exception("403"))
    fake._get_token = lambda: "tok"  # noqa: SLF001
    with patch.object(spotify_svc, "get_spotify_client", return_value=fake):
        assert spotify_svc.is_spotify_healthy(force=True) is False


def test_status_reflects_health(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    from app.services import spotify as spotify_svc

    spotify_svc.reset_spotify_health_for_testing()
    # Force the cached health to True, then the status endpoint should
    # report enabled (the tab would show).
    spotify_svc._health_state["healthy"] = True  # noqa: SLF001
    spotify_svc._health_state["checked_at"] = __import__("time").time()  # noqa: SLF001
    r = client.get("/api/spotify/status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["enabled"] is True


def test_status_hides_tab_when_health_false(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    from app.services import spotify as spotify_svc

    spotify_svc.reset_spotify_health_for_testing()
    with patch.object(spotify_svc, "_probe_healthy", return_value=False):
        # No successful probe -> healthy stays False -> status disabled.
        r = client.get("/api/spotify/status", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["enabled"] is False
