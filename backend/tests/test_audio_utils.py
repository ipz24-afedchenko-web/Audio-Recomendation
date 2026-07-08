"""
Unit tests for the audio feature utilities.

These tests do not require librosa or a database — they only verify the
vector extraction / similarity math.
"""

import math

import numpy as np
import pytest

from app.utils.audio_utils import (
    audio_features_to_dict,
    extract_feature_vector,
    normalize_features,
    genre_to_vector,
    GENRE_VOCABULARY,
    extract_feature_vector_length,
)


def test_audio_features_to_dict_handles_missing_fields():
    """All keys must be present even if values are None."""

    class Stub:
        tempo = 120
        key = 5
        mode = 1
        energy = 0.5
        valence = 0.7
        loudness = -10
        spectral_centroid_mean = 2000
        mfcc_mean = [0.1, 0.2]

    d = audio_features_to_dict(Stub())
    assert d["tempo"] == 120
    assert d["key"] == 5
    assert d["mfcc_mean"] == [0.1, 0.2]


def test_audio_features_to_dict_handles_missing_attrs():
    """Attributes absent on the input should become None (getattr default)."""

    class Empty:
        pass

    d = audio_features_to_dict(Empty())
    for k in ("tempo", "key", "mode", "energy", "valence", "loudness",
              "spectral_centroid_mean", "mfcc_mean"):
        assert k in d
        assert d[k] is None


def test_extract_feature_vector_returns_none_without_tempo():
    """Tempo is mandatory — without it we cannot cluster."""
    assert extract_feature_vector({}) is None


def test_extract_feature_vector_returns_none_without_energy():
    """Energy is mandatory — without it we cannot cluster."""
    feats = {"tempo": 120, "key": 0, "mode": 1}
    assert extract_feature_vector(feats) is None


def test_extract_feature_vector_length():
    """Vector must always be the same length: 1 + 12 + 1 + 1 + 1 + 1 + 13 = 30"""
    feats = {
        "tempo": 120,
        "key": 0,
        "mode": 1,
        "energy": 0.5,
        "valence": 0.5,
        "loudness": -10,
        "spectral_centroid_mean": 2000,
        "mfcc_mean": [0.0] * 20,
    }
    v = extract_feature_vector(feats)
    assert v is not None
    assert len(v) == 30
    for x in v:
        assert 0.0 <= x <= 1.0


def test_extract_feature_vector_handles_short_mfcc():
    """If we have <13 MFCCs we should still produce *some* vector."""
    feats = {
        "tempo": 120, "key": 0, "mode": 1, "energy": 0.5,
        "valence": 0.5, "loudness": -10,
        "spectral_centroid_mean": 2000,
        "mfcc_mean": [0.0, 0.1, 0.2],  # only 3
    }
    v = extract_feature_vector(feats)
    assert v is not None and len(v) == 30


def test_normalize_features_tempo_clipping():
    out = normalize_features({"tempo": 5.0, "loudness": -70.0})
    assert out["tempo_normalized"] == 0.0
    assert out["loudness_normalized"] == 0.0

    out = normalize_features({"tempo": 250.0, "loudness": 5.0})
    assert out["tempo_normalized"] == 1.0
    assert out["loudness_normalized"] == 1.0


def test_genre_to_vector_known_and_unknown():
    """Known genres one-hot; unknown genres fall into the 'other' bucket."""
    n = len(GENRE_VOCABULARY)
    rock = genre_to_vector("rock")
    assert len(rock) == n + 1
    assert rock[GENRE_VOCABULARY.index("rock")] == 1.0
    assert sum(rock) == 1.0

    # Case-insensitive + synonym normalisation.
    assert genre_to_vector("Hip Hop") == genre_to_vector("hip-hop")

    other = genre_to_vector("k-pop")
    assert other[-1] == 1.0  # "other" bucket
    assert sum(other) == 1.0


def test_genre_to_vector_missing_is_neutral():
    """No genre yields an all-zero (neutral) vector of fixed length."""
    vec = genre_to_vector(None)
    assert len(vec) == len(GENRE_VOCABULARY) + 1
    assert sum(vec) == 0.0


def test_extract_feature_vector_genre_appends_block():
    """W4-1: passing genre grows the vector by len(vocab)+1 over the audio-only 30."""
    feats = {
        "tempo": 120, "key": 0, "mode": 1, "energy": 0.5,
        "valence": 0.5, "loudness": -10,
        "spectral_centroid_mean": 2000, "mfcc_mean": [0.0] * 20,
    }
    audio_only = extract_feature_vector(feats)
    with_genre = extract_feature_vector(feats, genre="jazz")
    assert len(audio_only) == 30
    assert len(with_genre) == 30 + len(GENRE_VOCABULARY) + 1
    # Audio portion (first 30) must be identical.
    assert audio_only == with_genre[:30]


def test_extract_feature_vector_length_helper():
    """Helper mirrors the genre-aware length used by MLRecommender."""
    assert extract_feature_vector_length(include_genre=True) == 30 + len(GENRE_VOCABULARY) + 1
    assert extract_feature_vector_length(include_genre=False) == 30
