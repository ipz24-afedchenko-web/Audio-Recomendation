import os
from unittest.mock import patch, MagicMock

from app.services.cache import (
    cache_get,
    cache_set,
    recommendations_cache_key,
    reset_cache_for_testing,
    _get_redis,
)


def test_recommendations_cache_key_format():
    key = recommendations_cache_key(1, 2, 3, 10)
    assert key == "rec:1:2:3:10"


def test_get_redis_no_url():
    reset_cache_for_testing()
    os.environ.pop("REDIS_URL", None)
    assert _get_redis() is None


def test_cache_get_no_redis():
    reset_cache_for_testing()
    os.environ.pop("REDIS_URL", None)
    assert cache_get("anything") is None


def test_cache_set_no_redis():
    reset_cache_for_testing()
    os.environ.pop("REDIS_URL", None)
    cache_set("k", "v")


def test_get_redis_connects():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    mock_client = MagicMock()
    with patch("redis.from_url", return_value=mock_client):
        result = _get_redis()
        assert result is mock_client


def test_cache_get_hit():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    mock_client = MagicMock()
    mock_client.get.return_value = b'{"a": 1}'
    with patch("redis.from_url", return_value=mock_client):
        result = cache_get("mykey")
        assert result == {"a": 1}


def test_cache_get_miss():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    mock_client = MagicMock()
    mock_client.get.return_value = None
    with patch("redis.from_url", return_value=mock_client):
        assert cache_get("mykey") is None


def test_cache_get_exception():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    mock_client = MagicMock()
    mock_client.get.side_effect = Exception("boom")
    with patch("redis.from_url", return_value=mock_client):
        assert cache_get("mykey") is None


def test_cache_set_stores():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    mock_client = MagicMock()
    with patch("redis.from_url", return_value=mock_client):
        cache_set("k", {"b": 2}, ttl=60)
        mock_client.setex.assert_called_once_with("k", 60, '{"b": 2}')


def test_cache_set_exception():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    mock_client = MagicMock()
    mock_client.setex.side_effect = Exception("boom")
    with patch("redis.from_url", return_value=mock_client):
        cache_set("k", "v")


def test_get_redis_connect_fails_gracefully():
    reset_cache_for_testing()
    os.environ["REDIS_URL"] = "redis://bad:6379"
    with patch("redis.from_url") as m_from_url:
        m_from_url.side_effect = Exception("connection refused")
        assert _get_redis() is None
