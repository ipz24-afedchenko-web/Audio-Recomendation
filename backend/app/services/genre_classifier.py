"""
Genre Classifier Service

Provides basic genre classification for music tracks using
a Random Forest classifier trained on audio features.
"""

import os
import logging
from typing import List, Dict, Optional, Tuple

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
import joblib
from sqlalchemy.orm import Session

from app.models.audio_features import AudioFeatures
from app.models.music import Music
from app.utils.audio_utils import audio_features_to_dict, extract_feature_vector

logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")


class GenreClassifier:
    """
    Basic genre classifier using Random Forest on audio feature vectors.

    Training requires tracks that already have a ``genre`` label in the
    ``music`` table.  Once trained, the classifier can predict genres for
    unlabelled tracks.

    Persisted artefacts (via joblib):
        - ``genre_classifier.joblib`` — trained RandomForest model
        - ``genre_label_encoder.joblib`` — LabelEncoder for genre strings
        - ``genre_scaler.joblib`` — StandardScaler fitted on training data
    """

    def __init__(
        self,
        n_estimators: int = 100,
        random_state: int = 42,
        test_size: float = 0.2,
    ):
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.test_size = test_size

        self.model: Optional[RandomForestClassifier] = None
        self.label_encoder: Optional[LabelEncoder] = None
        self.scaler: Optional[StandardScaler] = None
        self._ensure_models_dir()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_models_dir() -> None:
        os.makedirs(MODELS_DIR, exist_ok=True)

    def _model_path(self) -> str:
        return os.path.join(MODELS_DIR, "genre_classifier.joblib")

    def _encoder_path(self) -> str:
        return os.path.join(MODELS_DIR, "genre_label_encoder.joblib")

    def _scaler_path(self) -> str:
        return os.path.join(MODELS_DIR, "genre_scaler.joblib")

    def save_models(self) -> None:
        """Persist all artefacts to disk."""
        if self.model is not None:
            joblib.dump(self.model, self._model_path())
        if self.label_encoder is not None:
            joblib.dump(self.label_encoder, self._encoder_path())
        if self.scaler is not None:
            joblib.dump(self.scaler, self._scaler_path())
        logger.info("Genre classifier models saved to %s", MODELS_DIR)

    def load_models(self) -> bool:
        """Load previously saved models.  Returns True on success."""
        paths = (self._model_path(), self._encoder_path(), self._scaler_path())
        if all(os.path.exists(p) for p in paths):
            try:
                self.model = joblib.load(self._model_path())
                self.label_encoder = joblib.load(self._encoder_path())
                self.scaler = joblib.load(self._scaler_path())
                logger.info("Genre classifier models loaded from disk")
                return True
            except Exception as e:
                logger.error("Failed to load genre classifier: %s", str(e))
                return False
        return False

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def _prepare_training_data(
        self, db: Session
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[List[str]]]:
        """
        Collect training samples: tracks that have both audio features and
        a non-null genre label.

        Returns:
            (X, y_encoded, genre_names)  or  (None, None, None) if insufficient data.
        """
        # Join Music (for genre label) with AudioFeatures (for feature vector)
        rows = (
            db.query(Music, AudioFeatures)
            .join(AudioFeatures, AudioFeatures.music_id == Music.id)
            .filter(Music.genre.isnot(None), Music.genre != "")
            .all()
        )

        if len(rows) < 5:
            logger.warning(
                "Not enough labelled tracks for training (%d found, need ≥5)", len(rows)
            )
            return None, None, None

        vectors: List[List[float]] = []
        labels: List[str] = []

        for music, af in rows:
            feat_dict = audio_features_to_dict(af)
            vec = extract_feature_vector(feat_dict)
            if vec is not None:
                vectors.append(vec)
                labels.append(music.genre.strip().lower())

        if len(vectors) < 5:
            return None, None, None

        X = np.array(vectors, dtype=np.float64)

        self.label_encoder = LabelEncoder()
        y = self.label_encoder.fit_transform(labels)

        return X, y, labels

    def train(self, db: Session) -> Dict:
        """
        Train the genre classifier on labelled tracks in the database.

        Returns:
            Dictionary with training metrics.
        """
        X, y, _ = self._prepare_training_data(db)

        if X is None or y is None:
            return {
                "status": "error",
                "message": "Not enough labelled tracks (need ≥5 with genre set).",
            }

        n_classes = len(self.label_encoder.classes_)

        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Train / test split (skip if very few samples)
        if len(X_scaled) >= 10:
            X_train, X_test, y_train, y_test = train_test_split(
                X_scaled, y, test_size=self.test_size, random_state=self.random_state,
                stratify=y if n_classes <= len(y) * self.test_size else None,
            )
        else:
            X_train, X_test, y_train, y_test = X_scaled, X_scaled, y, y

        # Train Random Forest
        self.model = RandomForestClassifier(
            n_estimators=self.n_estimators,
            random_state=self.random_state,
            n_jobs=-1,
        )
        self.model.fit(X_train, y_train)

        # Evaluate
        y_pred = self.model.predict(X_test)
        accuracy = float(accuracy_score(y_test, y_pred))
        report = classification_report(
            y_test, y_pred,
            target_names=self.label_encoder.classes_,
            output_dict=True,
            zero_division=0,
        )

        # Feature importance
        importances = self.model.feature_importances_.tolist()

        # Persist
        self.save_models()

        logger.info(
            "Genre classifier trained: %d samples, %d classes, accuracy=%.2f%%",
            len(X_scaled),
            n_classes,
            accuracy * 100,
        )

        return {
            "status": "success",
            "total_samples": len(X_scaled),
            "n_classes": n_classes,
            "classes": self.label_encoder.classes_.tolist(),
            "accuracy": accuracy,
            "classification_report": report,
            "feature_importances": importances,
        }

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

    def predict(self, db: Session, music_id: int) -> Optional[Dict]:
        """
        Predict genre for a single track.

        Returns:
            Dict with predicted genre and probability, or None.
        """
        if self.model is None or self.label_encoder is None or self.scaler is None:
            if not self.load_models():
                return None

        af = (
            db.query(AudioFeatures)
            .filter(AudioFeatures.music_id == music_id)
            .first()
        )
        if af is None:
            return None

        feat_dict = audio_features_to_dict(af)
        vec = extract_feature_vector(feat_dict)
        if vec is None:
            return None

        X = self.scaler.transform(np.array([vec], dtype=np.float64))
        predicted_label = self.model.predict(X)[0]
        probabilities = self.model.predict_proba(X)[0]

        genre_name = self.label_encoder.inverse_transform([predicted_label])[0]
        confidence = float(probabilities.max())

        # Build probability distribution
        genre_probs = {
            self.label_encoder.inverse_transform([i])[0]: float(p)
            for i, p in enumerate(probabilities)
        }

        return {
            "music_id": music_id,
            "predicted_genre": genre_name,
            "confidence": confidence,
            "genre_probabilities": genre_probs,
        }

    def predict_batch(self, db: Session) -> Dict:
        """
        Predict genres for all tracks missing a genre label.

        Returns:
            Summary dict with prediction counts.
        """
        if self.model is None or self.label_encoder is None or self.scaler is None:
            if not self.load_models():
                return {"status": "error", "message": "Genre classifier not trained yet."}

        # Tracks without genre
        unlabelled = (
            db.query(Music, AudioFeatures)
            .join(AudioFeatures, AudioFeatures.music_id == Music.id)
            .filter((Music.genre.is_(None)) | (Music.genre == ""))
            .all()
        )

        if not unlabelled:
            return {"status": "ok", "message": "All tracks already have genre labels.", "predicted": 0}

        predicted_count = 0
        for music, af in unlabelled:
            result = self.predict(db, music.id)
            if result:
                from app.utils.audio_utils import genre_to_title_case
                music.genre = genre_to_title_case(result["predicted_genre"])
                predicted_count += 1

        db.commit()

        return {
            "status": "success",
            "predicted": predicted_count,
            "total_unlabelled": len(unlabelled),
        }
