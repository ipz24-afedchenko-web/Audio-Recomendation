"""
Tests for perceptual fingerprinting and deduplication.

Uses synthetic audio (a short sine sweep) so we never touch real files.
"""

import numpy as np
import pytest

from app.models.audio_features import AudioFeatures
from app.models.music import Music
from app.models.user import User
from app.utils.audio_utils import (
    compute_perceptual_fingerprint,
    fingerprint_similarity,
)
from app.services.ml_recommender import MLRecommender


# ------------------------------------------------------------------
# Unit: fingerprint computation
# ------------------------------------------------------------------

def _sine_tone(freq=440, duration=3.0, sr=22050):
    """Generate a simple sine wave."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return 0.5 * np.sin(2 * np.pi * freq * t)


def test_compute_fingerprint_returns_64_dims():
    y = _sine_tone(freq=440, duration=5.0)
    fp = compute_perceptual_fingerprint(y, 22050)
    assert fp is not None
    assert len(fp) == 64  # 32 mel-mean + 32 mel-std
    for v in fp:
        assert isinstance(v, float)


def test_compute_fingerprint_same_audio_similar():
    y = _sine_tone(freq=440, duration=5.0)
    fp1 = compute_perceptual_fingerprint(y, 22050)
    fp2 = compute_perceptual_fingerprint(y, 22050)
    assert fp1 is not None and fp2 is not None
    sim = fingerprint_similarity(fp1, fp2)
    assert sim > 0.99, f"Same audio should match, got {sim}"


def test_compute_fingerprint_different_audio_different():
    y_a = _sine_tone(freq=220, duration=5.0)  # A3
    y_b = np.zeros(int(22050 * 5))  # silence (no frequency content)
    fp1 = compute_perceptual_fingerprint(y_a, 22050)
    fp2 = compute_perceptual_fingerprint(y_b, 22050)
    assert fp1 is not None and fp2 is not None
    sim = fingerprint_similarity(fp1, fp2)
    assert sim < 0.9, f"Tone and silence should differ, got {sim}"


def test_fingerprint_too_short_returns_none():
    y = np.zeros(100)  # way too short
    fp = compute_perceptual_fingerprint(y, 22050)
    assert fp is None


def test_fingerprint_silence():
    y = np.zeros(int(22050 * 5))  # 5 seconds of silence
    fp = compute_perceptual_fingerprint(y, 22050)
    assert fp is not None
    assert len(fp) == 64


# ------------------------------------------------------------------
# Integration: find_perceptual_duplicates
# ------------------------------------------------------------------

@pytest.fixture()
def two_similar_tracks(db_session):
    """Insert two tracks with identical fingerprints (simulating same
    song in different formats) and one different track."""
    user = User(
        email="dedup@x.com", username="dedup", hashed_password="x", is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    # Track A (original)
    m1 = Music(title="song A", user_id=user.id, file_path="/a.mp3", file_hash="aaa")
    db_session.add(m1)
    db_session.flush()
    af1 = AudioFeatures(
        music_id=m1.id, tempo=120, energy=0.5,
        perceptual_fingerprint=[0.5] * 64,
    )
    db_session.add(af1)

    # Track B (same song as WAV — very similar fingerprint)
    fp_similar = [0.51 if i % 2 == 0 else 0.49 for i in range(64)]
    m2 = Music(title="song A (wav)", user_id=user.id, file_path="/a.wav", file_hash="bbb")
    db_session.add(m2)
    db_session.flush()
    af2 = AudioFeatures(
        music_id=m2.id, tempo=120, energy=0.5,
        perceptual_fingerprint=fp_similar,
    )
    db_session.add(af2)

    # Track C (completely different)
    m3 = Music(title="song B", user_id=user.id, file_path="/b.mp3", file_hash="ccc")
    db_session.add(m3)
    db_session.flush()
    af3 = AudioFeatures(
        music_id=m3.id, tempo=90, energy=0.3,
        perceptual_fingerprint=[0.0] * 64,
    )
    db_session.add(af3)

    db_session.commit()
    return db_session, m1, m2, m3, user


def test_find_perceptual_duplicates_finds_match(two_similar_tracks):
    db, m1, m2, m3, user = two_similar_tracks
    rec = MLRecommender()
    dups = rec.find_perceptual_duplicates(m1.id, db, user.id, threshold=0.9)
    assert len(dups) == 1
    assert dups[0]["music_id"] == m2.id
    assert dups[0]["similarity"] >= 0.95


def test_find_perceptual_duplicates_no_match_for_different(two_similar_tracks):
    db, m1, m2, m3, user = two_similar_tracks
    rec = MLRecommender()
    dups = rec.find_perceptual_duplicates(m3.id, db, user.id, threshold=0.9)
    assert len(dups) == 0


def test_find_perceptual_duplicates_respects_threshold(two_similar_tracks):
    db, m1, m2, m3, user = two_similar_tracks
    rec = MLRecommender()
    high_thresh = rec.find_perceptual_duplicates(m1.id, db, user.id, threshold=0.99999)
    assert len(high_thresh) == 0


def test_find_perceptual_duplicates_missing_fingerprint_returns_empty(db_session):
    user = User(email="nofp@x.com", username="nofp", hashed_password="x", is_active=True)
    db_session.add(user)
    db_session.flush()
    m = Music(title="no fp", user_id=user.id, file_path="/nofp.mp3")
    db_session.add(m)
    db_session.flush()
    af = AudioFeatures(music_id=m.id, tempo=120, energy=0.5)
    db_session.add(af)
    db_session.commit()

    rec = MLRecommender()
    dups = rec.find_perceptual_duplicates(m.id, db_session, user.id)
    assert dups == []
