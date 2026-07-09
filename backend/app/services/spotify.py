import logging
import time
from typing import Dict, List, Optional

import httpx

from app.database import get_settings

logger = logging.getLogger(__name__)

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"

# Spotify audio-features keys we map into our feature space.
_SPOTIFY_FEATURE_KEYS = (
    "tempo", "key", "mode", "energy", "valence",
    "danceability", "acousticness", "loudness", "instrumentalness",
    "liveness", "speechiness",
)


class SpotifyError(Exception):
    """Raised for Spotify API / auth failures."""


class SpotifyClient:
    """Thin wrapper around the Spotify Web API (Client Credentials flow).

    No Premium required: we only read catalog metadata and the
    audio-features endpoint, and the frontend plays the free 30-second
    preview iframe.  Access tokens are cached in-memory until expiry.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
    ) -> None:
        s = get_settings()
        self.client_id = client_id or s.spotify_client_id
        self.client_secret = client_secret or s.spotify_client_secret
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    def _get_token(self) -> str:
        if self._token and time.time() < self._token_expires_at - 30:
            return self._token

        if not self.client_id or not self.client_secret:
            raise SpotifyError("Spotify credentials are not configured")

        resp = httpx.post(
            SPOTIFY_TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.error("Spotify token request failed: %s", resp.text)
            raise SpotifyError(f"Spotify auth failed ({resp.status_code})")

        payload = resp.json()
        self._token = payload["access_token"]
        # expires_in is seconds; default 3600.
        self._token_expires_at = time.time() + int(payload.get("expires_in", 3600))
        return self._token

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def search(self, query: str, limit: int = 10) -> List[Dict]:
        """Search tracks.  Returns lightweight dicts for the UI list."""
        token = self._get_token()
        resp = httpx.get(
            f"{SPOTIFY_API_BASE}/search",
            params={"q": query, "type": "track", "limit": limit},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise SpotifyError(f"Spotify search failed ({resp.status_code})")

        items = resp.json().get("tracks", {}).get("items", [])
        return [self._summarize_track(t) for t in items]

    def get_track(self, track_id: str) -> Dict:
        """Full track object for a known Spotify track id."""
        token = self._get_token()
        resp = httpx.get(
            f"{SPOTIFY_API_BASE}/tracks/{track_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise SpotifyError(f"Spotify track lookup failed ({resp.status_code})")
        return self._summarize_track(resp.json())

    def get_audio_features(self, track_id: str) -> Dict:
        """Raw Spotify audio-features payload."""
        token = self._get_token()
        resp = httpx.get(
            f"{SPOTIFY_API_BASE}/audio-features/{track_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise SpotifyError(f"Spotify audio-features failed ({resp.status_code})")
        return resp.json()

    # ------------------------------------------------------------------
    # Mapping → our AudioFeatures-compatible dict
    # ------------------------------------------------------------------
    def map_to_features(self, track: Dict, raw_features: Dict) -> Dict:
        """Build an ``AudioFeatures``-compatible dict from Spotify data.

        Our recommender expects a 30-dim librosa-style vector.  Spotify
        exposes tempo/key/mode/energy/valence directly, but not MFCCs or
        chroma — those are synthesised as stubs so Spotify tracks still
        land in the same vector space as librosa tracks (hybrid algorithm;
        cross-source similarity is approximate by design).
        """
        tempo = float(raw_features.get("tempo") or 0.0)
        key = int(raw_features.get("key") or 0)
        mode = int(raw_features.get("mode") or 0)
        energy = _clamp01(raw_features.get("energy"))
        valence = _clamp01(raw_features.get("valence"))

        # Loudness: Spotify gives dB directly; fall back to deriving from
        # energy when missing (mirrors librosa amplitude_to_db shape).
        loudness = raw_features.get("loudness")
        if loudness is None:
            import numpy as _np  # local import keeps module import light

            loudness = float(_np.log10(max(energy, 1e-6) + 1e-9) * 20.0)
        else:
            loudness = float(loudness)

        # Spectral centroid: approximated from acousticness/danceability —
        # brighter (more acoustic/danceable) tracks skew higher.  Stub only.
        centroid = 2000.0 * (0.4 + 0.6 * _clamp01(raw_features.get("acousticness")))

        return {
            "tempo": tempo,
            "duration": (track.get("duration_ms") or 0) / 1000.0,
            "key": key,
            "mode": mode,
            "loudness": loudness,
            "energy": energy,
            "valence": valence,
            "spectral_centroid_mean": centroid,
            "spectral_centroid_std": centroid * 0.1,
            "spectral_bandwidth_mean": centroid * 1.5,
            "spectral_bandwidth_std": centroid * 0.2,
            "spectral_rolloff_mean": centroid * 2.0,
            "spectral_rolloff_std": centroid * 0.3,
            "mfcc_mean": [0.0] * 20,
            "mfcc_std": [0.0] * 20,
            "zero_crossing_rate_mean": 0.05 + 0.1 * _clamp01(
                raw_features.get("speechiness")
            ),
            "zero_crossing_rate_std": 0.02,
            "chroma_stft_mean": [0.0] * 12,
            "chroma_stft_std": [0.0] * 12,
            "feature_origin": "spotify",
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _summarize_track(t: Dict) -> Dict:
        artists = ", ".join(a.get("name", "") for a in t.get("artists", []))
        album = (t.get("album") or {}).get("name")
        external_urls = t.get("external_urls") or {}
        return {
            "spotify_track_id": t.get("id"),
            "title": t.get("name"),
            "artist": artists or None,
            "album": album,
            "duration_ms": t.get("duration_ms"),
            "preview_url": t.get("preview_url"),
            "external_uri": t.get("uri"),
            "external_url": external_urls.get("spotify"),
            "image_url": _first_image(t),
        }


def _first_image(track: Dict) -> Optional[str]:
    images = (track.get("album") or {}).get("images") or []
    return images[0].get("url") if images else None


def _clamp01(v) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, f))


_client: Optional[SpotifyClient] = None


def get_spotify_client() -> SpotifyClient:
    global _client
    if _client is None:
        _client = SpotifyClient()
    return _client


def reset_spotify_client_for_testing() -> None:
    global _client
    _client = None


# ----------------------------------------------------------------------
# Runtime health cache
#
# The free Spotify Web API only works once the app owner's account holds
# an active Premium subscription, and Spotify can take several hours to
# flip the flag after purchase.  Rather than trust the static
# ``spotify_enabled`` config alone, we lazily probe the API and cache the
# result so the frontend can hide the catalog tab automatically when the
# service is unreachable (e.g. returns 403) or misconfigured.
# ----------------------------------------------------------------------

_HEALTH_TTL_SECONDS = 300  # re-probe at most once every 5 minutes
_health_state: dict = {"healthy": False, "checked_at": 0.0}


def _probe_healthy(client: SpotifyClient) -> bool:
    """Best-effort liveness probe: a token + one tiny search call."""
    try:
        client._get_token()  # noqa: SLF001 - internal but cheap
        client.search("a", limit=1)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("Spotify health probe failed: %s", str(e))
        return False


def is_spotify_healthy(force: bool = False) -> bool:
    """Return (and cache) whether the Spotify API is currently usable.

    Respects the static ``spotify_enabled`` flag first; if that is off we
    never probe.  Otherwise we probe on first call and then reuse the
    cached result until it expires (or ``force=True``).
    """
    from app.database import get_settings as _get_settings

    settings = _get_settings()
    if not settings.spotify_enabled:
        return False

    now = time.time()
    if not force and (now - _health_state["checked_at"]) < _HEALTH_TTL_SECONDS:
        return _health_state["healthy"]

    _health_state["healthy"] = _probe_healthy(get_spotify_client())
    _health_state["checked_at"] = now
    return _health_state["healthy"]


def mark_spotify_unhealthy() -> None:
    """Called by routes when a live Spotify call fails, so the tab hides
    immediately without waiting for the TTL to expire."""
    _health_state["healthy"] = False
    _health_state["checked_at"] = time.time()


def reset_spotify_health_for_testing() -> None:
    _health_state["healthy"] = False
    _health_state["checked_at"] = 0.0
