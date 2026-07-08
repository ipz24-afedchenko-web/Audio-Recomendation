"""
Tests for the audio analysis runner that powers the upload BackgroundTask.

We do NOT call librosa here — a tiny fake file is enough to exercise
the status lifecycle (pending → analyzing → ready / error).
"""

import os
from unittest.mock import patch

import pytest
from sqlalchemy.orm import sessionmaker

from app.models.audio_features import AudioFeatures
from app.models.music import (
    Music,
    ANALYSIS_STATUS_PENDING,
    ANALYSIS_STATUS_ANALYZING,
    ANALYSIS_STATUS_READY,
    ANALYSIS_STATUS_ERROR,
)
from app.models.user import User
from app.services.audio_analyzer import run_analysis


def _make_mp3_bytes(payload: bytes = b"") -> bytes:
    return b"ID3\x04\x00\x00\x00\x00\x00\x00" + (payload or b"\x00" * 64)


def _create_track(engine, *, file_path, status=ANALYSIS_STATUS_PENDING, email="x@x.com", username="x") -> int:
    """Insert a track using the SAME engine ``run_analysis`` will use."""
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        u = User(email=email, username=username, hashed_password="h", is_active=True)
        s.add(u)
        s.flush()
        m = Music(
            title="t", user_id=u.id, file_path=file_path, file_hash="deadbeef" * 8,
            analysis_status=status,
        )
        s.add(m)
        s.commit()
        return m.id
    finally:
        s.close()


def test_run_analysis_sets_status_lifecycle(uploads_dir, engine):
    path = os.path.join(uploads_dir, "fake.mp3")
    with open(path, "wb") as f:
        f.write(_make_mp3_bytes())
    music_id = _create_track(engine, file_path=path, email="lifecycle@x.com", username="lifecycle")

    with patch("app.services.audio_analyzer.AudioAnalyzer") as MockAnalyzer:
        instance = MockAnalyzer.return_value
        instance.analyze.return_value = {
            "tempo": 120.0, "duration": 3.0, "key": 0, "mode": 1,
            "loudness": -10.0, "energy": 0.5, "valence": 0.5,
            "spectral_centroid_mean": 2000.0, "spectral_centroid_std": 100.0,
            "spectral_bandwidth_mean": 1500.0, "spectral_bandwidth_std": 50.0,
            "spectral_rolloff_mean": 3000.0, "spectral_rolloff_std": 200.0,
            "mfcc_mean": [0.0] * 20, "mfcc_std": [0.0] * 20,
            "zero_crossing_rate_mean": 0.1, "zero_crossing_rate_std": 0.01,
            "chroma_stft_mean": [1.0 / 12] * 12, "chroma_stft_std": [0.0] * 12,
            "perceptual_fingerprint": [0.5] * 64,
        }
        instance.estimate_valence.return_value = 0.5

        ok = run_analysis(music_id)

    assert ok is True

    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        m = s.query(Music).filter(Music.id == music_id).first()
        assert m.analysis_status == ANALYSIS_STATUS_READY
        assert m.analysis_error is None
        assert m.audio_features is not None
        assert m.audio_features.tempo == 120.0
    finally:
        s.close()


def test_run_analysis_records_error_when_librosa_raises(uploads_dir, engine):
    path = os.path.join(uploads_dir, "fake2.mp3")
    with open(path, "wb") as f:
        f.write(_make_mp3_bytes())
    music_id = _create_track(engine, file_path=path, email="error@x.com", username="error")

    with patch("app.services.audio_analyzer.AudioAnalyzer") as MockAnalyzer:
        MockAnalyzer.return_value.analyze.side_effect = RuntimeError("librosa is sad")
        ok = run_analysis(music_id)

    assert ok is False

    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        m = s.query(Music).filter(Music.id == music_id).first()
        assert m.analysis_status == ANALYSIS_STATUS_ERROR
        assert "librosa is sad" in m.analysis_error
    finally:
        s.close()


def test_run_analysis_is_idempotent_when_features_exist(uploads_dir, engine):
    """If features are already there, the runner must NOT overwrite them."""
    path = os.path.join(uploads_dir, "fake3.mp3")
    with open(path, "wb") as f:
        f.write(_make_mp3_bytes())

    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        u = User(email="idempotent@x.com", username="idempotent", hashed_password="h", is_active=True)
        s.add(u)
        s.flush()
        m = Music(
            title="t", user_id=u.id, file_path=path, file_hash="cafebabe" * 8,
            analysis_status=ANALYSIS_STATUS_PENDING,
        )
        s.add(m)
        s.flush()
        af = AudioFeatures(music_id=m.id, tempo=99.0, energy=0.1)
        s.add(af)
        s.commit()
        music_id = m.id
    finally:
        s.close()

    with patch("app.services.audio_analyzer.AudioAnalyzer") as MockAnalyzer:
        ok = run_analysis(music_id)

    assert ok is True
    s = Session()
    try:
        m = s.query(Music).filter(Music.id == music_id).first()
        assert m.analysis_status == ANALYSIS_STATUS_READY
        assert m.audio_features.tempo == 99.0
        MockAnalyzer.assert_not_called()
    finally:
        s.close()


def test_run_analysis_returns_false_for_missing_track(engine):
    ok = run_analysis(999_999_999)
    assert ok is False
