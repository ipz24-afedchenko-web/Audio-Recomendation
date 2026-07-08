"""
Tests for the JWT / auth utility functions.

No DB needed — these are pure crypto helpers.
"""

import time

import pytest
from jose import jwt

from app.database import get_settings
from app.utils.auth import create_access_token, get_password_hash, verify_password

settings = get_settings()


def test_password_hash_roundtrip():
    plain = "my-very-secret-password"
    h = get_password_hash(plain)
    assert h != plain
    assert verify_password(plain, h)
    assert not verify_password("wrong", h)


def test_token_contains_sub_and_exp():
    token = create_access_token(data={"sub": "alice"})
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert payload["sub"] == "alice"
    assert "exp" in payload


def test_token_expires_in_configured_window():
    token = create_access_token(data={"sub": "bob"})
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    ttl = payload["exp"] - int(time.time())
    # ±10s window around the configured 24h (1440 min) expiry
    assert abs(ttl - settings.access_token_expire_minutes * 60) < 10
