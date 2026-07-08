import numpy as np

from app.utils.audio_utils import (
    _normalize_genre,
    normalize_features,
    extract_feature_vector,
    calculate_feature_similarity,
    get_feature_weights,
    fingerprint_similarity,
)


def test_normalize_genre_none():
    assert _normalize_genre(None) is None
    assert _normalize_genre("") is None


def test_normalize_genre_synonym():
    assert _normalize_genre("Hip Hop") == "hip-hop"
    assert _normalize_genre("RNB") == "r&b"


def test_normalize_features_with_spectral():
    feats = {"tempo": 120, "loudness": -10, "spectral_centroid_mean": 4000}
    out = normalize_features(feats)
    assert out["spectral_centroid_normalized"] == 0.5


def test_extract_feature_vector_missing_key():
    feats = {"tempo": 120, "energy": 0.5, "valence": 0.5, "spectral_centroid_mean": 2000, "mfcc_mean": [0.0]*20}
    v = extract_feature_vector(feats)
    assert v is not None
    assert len(v) == 30


def test_extract_feature_vector_missing_mode():
    feats = {"tempo": 120, "key": 5, "energy": 0.5, "valence": 0.5, "spectral_centroid_mean": 2000, "mfcc_mean": [0.0]*20}
    v = extract_feature_vector(feats)
    assert v is not None
    assert v[13] == 0.5


def test_extract_feature_vector_missing_valence():
    feats = {"tempo": 120, "key": 0, "mode": 1, "energy": 0.5, "spectral_centroid_mean": 2000, "mfcc_mean": [0.0]*20}
    v = extract_feature_vector(feats)
    assert v is not None


def test_extract_feature_vector_missing_spectral():
    feats = {"tempo": 120, "key": 0, "mode": 1, "energy": 0.5, "valence": 0.5, "mfcc_mean": [0.0]*20}
    v = extract_feature_vector(feats)
    assert v is not None


def test_calculate_feature_similarity_identical():
    feats = {"tempo": 120, "key": 0, "mode": 1, "energy": 0.5, "valence": 0.5, "loudness": -10, "spectral_centroid_mean": 2000, "mfcc_mean": [0.0]*20}
    sim = calculate_feature_similarity(feats, feats)
    assert sim is not None
    assert sim >= 0.99


def test_calculate_feature_similarity_different():
    a = {"tempo": 60, "key": 0, "mode": 0, "energy": 0.1, "valence": 0.1, "loudness": -30, "spectral_centroid_mean": 500, "mfcc_mean": [0.0]*20}
    b = {"tempo": 180, "key": 5, "mode": 1, "energy": 0.9, "valence": 0.9, "loudness": -3, "spectral_centroid_mean": 7000, "mfcc_mean": [0.9]*20}
    sim = calculate_feature_similarity(a, b)
    assert sim is not None
    assert sim < 0.99


def test_calculate_feature_similarity_missing_features():
    sim = calculate_feature_similarity({}, {})
    assert sim is None


def test_fingerprint_similarity_identical():
    fp = [0.1, 0.2, 0.3, 0.4, 0.5]*13
    assert fingerprint_similarity(fp, fp) >= 0.99


def test_fingerprint_similarity_orthogonal():
    a = [1.0, 0.0]
    b = [0.0, 1.0]
    sim = fingerprint_similarity(a, b)
    assert 0.4 < sim < 0.6


def test_fingerprint_similarity_zero_norm():
    sim = fingerprint_similarity([0.0, 0.0], [1.0, 1.0])
    assert sim == 0.0


def test_get_feature_weights():
    w = get_feature_weights()
    assert "temporal" in w
    assert "timbre" in w
    assert w["timbre"] == 1.5


def test_extract_feature_vector_missing_mfcc():
    feats = {"tempo": 120, "key": 0, "mode": 1, "energy": 0.5, "valence": 0.5, "spectral_centroid_mean": 2000}
    v = extract_feature_vector(feats)
    assert v is not None
