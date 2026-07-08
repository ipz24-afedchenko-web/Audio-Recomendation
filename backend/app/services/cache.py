import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    url = os.getenv("REDIS_URL")
    if not url:
        return None

    try:
        import redis  # noqa: E402
        _redis_client = redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        _redis_client.ping()
        logger.info("Redis connected at %s", url.replace(url.partition("@")[2] or "", "****"))
        return _redis_client
    except Exception as e:
        logger.warning("Redis unavailable — caching disabled: %s", str(e))
        return None


def reset_cache_for_testing() -> None:
    global _redis_client
    _redis_client = None


def cache_get(key: str) -> Optional[Any]:
    client = _get_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception as e:
        logger.warning("Cache GET error: %s", str(e))
    return None


def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    client = _get_redis()
    if client is None:
        return
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning("Cache SET error: %s", str(e))


def recommendations_cache_key(user_id: int, music_id: int, algorithm: int, limit: int) -> str:
    return f"rec:{user_id}:{music_id}:{algorithm}:{limit}"
