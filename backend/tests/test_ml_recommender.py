"""
Tests for the MLRecommender service.  We hit it against a SQLite in-memory
DB seeded with synthetic AudioFeatures rows so we never touch real audio.
"""

import numpy as np
import pytest

from app.models.audio_features import AudioFeatures
from app.models.music import Music
from app.models.user import User
from app.services.ml_recommender import MLRecommender


# Mandatory + optional features used in extract_feature_vector.
# Energy and tempo are mandatory; the rest is optional.
BASE_FEATS = {
    "tempo": 120,
    "key": 0,
    "mode": 1,
    "energy": 0.5,
    "valence": 0.5,
    "loudness": -10.0,
    "spectral_centroid_mean": 2000.0,
    "mfcc_mean": [0.0] * 20,
}


@pytest.fixture()
def seeded_db(db_session):
    """Insert one user + 6 tracks with different feature vectors.

    Returns the SAME db_session — tests below pass it directly to the
    recommender, which expects a SQLAlchemy Session.
    """
    user = User(
        email="ml@x.com",
        username="mluser",
        hashed_password="x",
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()

    tracks = []
    afs = []
    for i, (tempo, energy) in enumerate([
        (120, 0.5), (130, 0.6), (90, 0.3),
        (140, 0.7), (100, 0.4), (110, 0.55),
    ]):
        m = Music(
            title=f"track-{i}",
            user_id=user.id,
            file_path=f"/dev/null/{i}.mp3",
        )
        db_session.add(m)
        db_session.flush()
        tracks.append(m)
        af = AudioFeatures(music_id=m.id, **BASE_FEATS)
        af.tempo = tempo
        af.energy = energy
        db_session.add(af)
        afs.append(af)
    db_session.commit()
    return db_session


def test_fit_clusters_assigns_labels(seeded_db):
    rec = MLRecommender(n_clusters=3, auto_tune=False)
    result = rec.fit_clusters(seeded_db)
    assert result["status"] == "success"
    assert result["total_tracks"] == 6
    assert result["n_clusters"] == 3
    afs = seeded_db.query(AudioFeatures).all()
    for af in afs:
        assert af.cluster_id is not None
        assert 0 <= af.cluster_id < 3


def test_get_recommendations_returns_top_n(seeded_db):
    rec = MLRecommender(n_clusters=3, auto_tune=False)
    rec.fit_clusters(seeded_db)
    rec.load_models()

    source = seeded_db.query(Music).first()
    user = seeded_db.query(User).first()
    recs = rec.get_recommendations(
        music_id=source.id, db=seeded_db, user_id=user.id, limit=3,
    )
    assert len(recs) == 3
    for r in recs:
        assert r["recommended_music_id"] != source.id
        assert 0.0 <= r["similarity_score"] <= 1.0
        # Music batch-loaded — the relationship must be present.
        assert r["recommended_music"] is not None


def test_recommendations_upsert_keeps_history_for_other_algorithms(seeded_db):
    rec = MLRecommender(n_clusters=3, auto_tune=False)
    rec.fit_clusters(seeded_db)
    rec.load_models()
    source = seeded_db.query(Music).first()
    user = seeded_db.query(User).first()

    rec.get_recommendations(source.id, seeded_db, user.id, limit=2, algorithm=1)
    rec.get_recommendations(source.id, seeded_db, user.id, limit=2, algorithm=3)

    from app.models.recommendation import Recommendation
    rows = (
        seeded_db.query(Recommendation)
        .filter(Recommendation.user_id == user.id)
        .all()
    )
    algos = {r.algorithm for r in rows}
    assert algos == {1, 3}, "Rows for both algorithms must be preserved"


def test_find_optimal_clusters_picks_best_k():
    from sklearn.preprocessing import StandardScaler
    rng = np.random.RandomState(42)
    # 3 well-separated blobs → optimal k should be 3
    X = np.vstack([
        rng.normal(loc=[0, 0], scale=0.3, size=(20, 2)),
        rng.normal(loc=[5, 5], scale=0.3, size=(20, 2)),
        rng.normal(loc=[10, 0], scale=0.3, size=(20, 2)),
    ])
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)
    k, score = MLRecommender._find_optimal_clusters(Xs, max_k=6, random_state=42)
    assert k == 3, f"Expected k=3, got {k}"
    assert score > 0.5, f"Silhouette too low: {score}"


def test_find_optimal_clusters_small_sample():
    X = np.random.RandomState(42).normal(size=(3, 5))
    from sklearn.preprocessing import StandardScaler
    Xs = StandardScaler().fit_transform(X)
    k, score = MLRecommender._find_optimal_clusters(Xs, random_state=42)
    assert k == 1, f"Expected k=1 for tiny sample, got {k}"
    assert score == -1.0


def test_fit_clusters_auto_tune_returns_silhouette(seeded_db):
    rec = MLRecommender(auto_tune=True)
    result = rec.fit_clusters(seeded_db)
    assert result["status"] == "success"
    assert result["silhouette_score"] is not None
    assert 0 <= result["silhouette_score"] <= 1


def test_fit_clusters_auto_tune_finds_optimal(seeded_db):
    rec = MLRecommender(auto_tune=True)
    result = rec.fit_clusters(seeded_db)
    assert result["n_clusters"] >= 2
    assert result["n_clusters"] <= 6  # sqrt(6) ≈ 2, clamped to n-1=5; min 2


def test_fit_clusters_respects_explicit_n_clusters(seeded_db):
    rec = MLRecommender(n_clusters=3, auto_tune=False)
    result = rec.fit_clusters(seeded_db)
    assert result["n_clusters"] == 3


def test_auto_retrain_gating(seeded_db):
    rec = MLRecommender(n_clusters=3, auto_tune=False)
    rec.load_models()  # nothing on disk in test env
    rec._last_fit_n_tracks = 0
    assert rec.should_auto_retrain(seeded_db) is True

    rec.fit_clusters(seeded_db)
    rec._last_fit_n_tracks = 6
    assert rec.should_auto_retrain(seeded_db) is False

    rec._last_fit_n_tracks = 4
    assert rec.should_auto_retrain(seeded_db) is True
