import os
from unittest.mock import patch

import numpy as np
import pytest

from app.services.genre_classifier import GenreClassifier
from app.models.audio_features import AudioFeatures
from app.models.music import Music


def _seed_genre_track(db_session, user_id, title, genre, tempo=120.0):
    m = Music(
        title=title, user_id=user_id, file_path=f"/dev/null/{title}.mp3",
        genre=genre,
    )
    db_session.add(m)
    db_session.flush()
    af = AudioFeatures(
        music_id=m.id, tempo=tempo, key=0, mode=1, energy=0.5,
        valence=0.5, loudness=-10.0, spectral_centroid_mean=2000.0,
        mfcc_mean=[0.0] * 20,
    )
    db_session.add(af)
    db_session.flush()
    return m


def test_genre_classifier_init():
    gc = GenreClassifier()
    assert gc.model is None
    assert gc.label_encoder is None
    assert gc.scaler is None


def test_genre_classifier_not_trained_returns_none(db_session):
    gc = GenreClassifier()
    result = gc.predict(db_session, 1)
    assert result is None


def test_genre_classifier_train_no_labelled_tracks(db_session):
    gc = GenreClassifier()
    result = gc.train(db_session)
    assert result["status"] == "error"


def test_genre_classifier_train_and_predict(db_session):
    u = 1
    _seed_genre_track(db_session, u, "r1", "rock", tempo=120.0)
    _seed_genre_track(db_session, u, "r2", "rock", tempo=130.0)
    _seed_genre_track(db_session, u, "r3", "rock", tempo=110.0)
    _seed_genre_track(db_session, u, "j1", "jazz", tempo=90.0)
    _seed_genre_track(db_session, u, "j2", "jazz", tempo=100.0)
    _seed_genre_track(db_session, u, "j3", "jazz", tempo=95.0)
    _seed_genre_track(db_session, u, "c1", "classical", tempo=60.0)
    _seed_genre_track(db_session, u, "c2", "classical", tempo=70.0)
    _seed_genre_track(db_session, u, "c3", "classical", tempo=65.0)

    gc = GenreClassifier()
    result = gc.train(db_session)
    assert result["status"] == "success"
    assert result["n_classes"] == 3
    assert result["total_samples"] == 9
    assert gc.model is not None
    assert gc.label_encoder is not None
    assert gc.scaler is not None

    jazz_track = db_session.query(Music).filter(Music.title == "j1").first()
    pred = gc.predict(db_session, jazz_track.id)
    assert pred is not None
    assert "predicted_genre" in pred
    assert "confidence" in pred


def test_genre_classifier_predict_no_features(db_session):
    m = Music(title="no-feat", user_id=1, file_path="/dev/null/nf.mp3")
    db_session.add(m)
    db_session.commit()

    gc = GenreClassifier()
    result = gc.predict(db_session, m.id)
    assert result is None


def test_genre_classifier_predict_batch(db_session):
    u = 1
    _seed_genre_track(db_session, u, "br1", "rock", tempo=120.0)
    _seed_genre_track(db_session, u, "br2", "rock", tempo=130.0)
    _seed_genre_track(db_session, u, "br3", "rock", tempo=125.0)
    _seed_genre_track(db_session, u, "bj1", "jazz", tempo=90.0)
    _seed_genre_track(db_session, u, "bj2", "jazz", tempo=100.0)
    _seed_genre_track(db_session, u, "bj3", "jazz", tempo=95.0)
    _seed_genre_track(db_session, u, "unlab1", None, tempo=110.0)
    _seed_genre_track(db_session, u, "unlab2", None, tempo=95.0)

    gc = GenreClassifier()
    train_res = gc.train(db_session)
    assert train_res["status"] == "success"

    batch_res = gc.predict_batch(db_session)
    assert batch_res["predicted"] >= 0


def test_genre_classifier_predict_batch_all_labelled(db_session):
    u = 1
    _seed_genre_track(db_session, u, "x1", "rock", tempo=120.0)
    _seed_genre_track(db_session, u, "x2", "jazz", tempo=90.0)

    gc = GenreClassifier()
    gc.train(db_session)
    batch_res = gc.predict_batch(db_session)
    assert "predicted" in batch_res


def test_genre_classifier_save_and_load_models(db_session):
    u = 1
    _seed_genre_track(db_session, u, "s1", "rock", tempo=120.0)
    _seed_genre_track(db_session, u, "s2", "jazz", tempo=90.0)
    _seed_genre_track(db_session, u, "s3", "rock", tempo=130.0)
    _seed_genre_track(db_session, u, "s4", "jazz", tempo=100.0)
    _seed_genre_track(db_session, u, "s5", "classical", tempo=60.0)

    gc = GenreClassifier()
    gc.train(db_session)
    gc.save_models()

    gc2 = GenreClassifier()
    assert gc2.load_models() is True
    assert gc2.model is not None


def test_genre_classifier_load_models_no_files():
    gc = GenreClassifier()
    with patch("app.services.genre_classifier.os.path.exists") as m:
        m.return_value = False
        assert gc.load_models() is False
