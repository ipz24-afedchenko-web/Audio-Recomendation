"""
ML Recommender Service

Provides music recommendations using:
- K-Means clustering for grouping similar tracks
- Cosine similarity for finding nearest neighbors
- Combined cluster-aware similarity for optimized recommendations
"""

import os
import logging
from typing import List, Dict, Optional, Tuple

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler
import joblib
from sqlalchemy.orm import Session

from app.models.audio_features import AudioFeatures
from app.models.music import Music
from app.models.recommendation import Recommendation
from app.utils.audio_utils import extract_feature_vector

logger = logging.getLogger(__name__)

# Directory for persisting trained models
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")


class MLRecommender:
    """
    Music recommendation engine based on audio feature similarity.

    Supports three recommendation strategies:
    1. Pure cosine similarity (algorithm=1)
    2. Euclidean distance (algorithm=2)
    3. Cluster-aware cosine similarity (algorithm=3) — default

    Workflow:
        1. Extract feature vectors from AudioFeatures records
        2. (Optional) Cluster tracks with K-Means
        3. Compute pairwise similarity
        4. Return top-N recommendations
    """

    DEFAULT_N_CLUSTERS = 8
    DEFAULT_TOP_N = 10

    def __init__(
        self,
        n_clusters: int = DEFAULT_N_CLUSTERS,
        random_state: int = 42,
    ):
        self.n_clusters = n_clusters
        self.random_state = random_state

        self.kmeans: Optional[KMeans] = None
        self.scaler: Optional[StandardScaler] = None
        self._ensure_models_dir()

    # ------------------------------------------------------------------
    # Model persistence
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_models_dir() -> None:
        """Create models directory if it does not exist."""
        os.makedirs(MODELS_DIR, exist_ok=True)

    def _kmeans_path(self) -> str:
        return os.path.join(MODELS_DIR, "kmeans_model.joblib")

    def _scaler_path(self) -> str:
        return os.path.join(MODELS_DIR, "scaler_model.joblib")

    def save_models(self) -> None:
        """Persist trained KMeans and scaler to disk."""
        if self.kmeans is not None:
            joblib.dump(self.kmeans, self._kmeans_path())
            logger.info("KMeans model saved to %s", self._kmeans_path())
        if self.scaler is not None:
            joblib.dump(self.scaler, self._scaler_path())
            logger.info("Scaler saved to %s", self._scaler_path())

    def load_models(self) -> bool:
        """
        Load previously trained models from disk.

        Returns:
            True if models were loaded successfully, False otherwise.
        """
        kmeans_path = self._kmeans_path()
        scaler_path = self._scaler_path()

        if os.path.exists(kmeans_path) and os.path.exists(scaler_path):
            try:
                self.kmeans = joblib.load(kmeans_path)
                self.scaler = joblib.load(scaler_path)
                self.n_clusters = self.kmeans.n_clusters
                logger.info("Models loaded successfully from disk")
                return True
            except Exception as e:
                logger.error("Failed to load models: %s", str(e))
                return False
        return False

    # ------------------------------------------------------------------
    # Feature extraction helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _features_to_dict(af: AudioFeatures) -> Dict:
        """Convert an AudioFeatures ORM instance to a plain dict."""
        return {
            "tempo": af.tempo,
            "key": af.key,
            "mode": af.mode,
            "energy": af.energy,
            "valence": af.valence,
            "loudness": af.loudness,
            "spectral_centroid_mean": af.spectral_centroid_mean,
            "mfcc_mean": af.mfcc_mean,
        }

    def _build_feature_matrix(
        self, features_list: List[AudioFeatures]
    ) -> Tuple[np.ndarray, List[int]]:
        """
        Build a feature matrix from a list of AudioFeatures records.

        Returns:
            (matrix, music_ids) where matrix is (N, D) and music_ids maps
            each row to the corresponding music_id.
        """
        vectors: List[List[float]] = []
        music_ids: List[int] = []

        for af in features_list:
            feat_dict = self._features_to_dict(af)
            vec = extract_feature_vector(feat_dict)
            if vec is not None:
                vectors.append(vec)
                music_ids.append(af.music_id)

        if not vectors:
            return np.array([]), []

        return np.array(vectors, dtype=np.float64), music_ids

    # ------------------------------------------------------------------
    # Clustering
    # ------------------------------------------------------------------

    def fit_clusters(self, db: Session) -> Dict:
        """
        Train K-Means clustering on all analysed tracks and persist
        cluster assignments to the database.

        Args:
            db: SQLAlchemy session

        Returns:
            Dictionary with training statistics.
        """
        all_features = db.query(AudioFeatures).all()

        if not all_features:
            return {"status": "error", "message": "No audio features found in database"}

        matrix, music_ids = self._build_feature_matrix(all_features)

        if len(music_ids) == 0:
            return {"status": "error", "message": "No valid feature vectors could be extracted"}

        # Adjust n_clusters if we have fewer samples than clusters
        effective_clusters = min(self.n_clusters, len(music_ids))

        # Fit scaler
        self.scaler = StandardScaler()
        matrix_scaled = self.scaler.fit_transform(matrix)

        # Fit K-Means
        self.kmeans = KMeans(
            n_clusters=effective_clusters,
            random_state=self.random_state,
            n_init=10,
            max_iter=300,
        )
        labels = self.kmeans.fit_predict(matrix_scaled)

        # Persist cluster assignments to DB
        music_id_to_label = dict(zip(music_ids, labels.tolist()))
        for af in all_features:
            if af.music_id in music_id_to_label:
                af.cluster_id = music_id_to_label[af.music_id]

        db.commit()

        # Save models to disk
        self.save_models()

        # Compute cluster statistics
        cluster_counts = {}
        for label in labels:
            cluster_counts[int(label)] = cluster_counts.get(int(label), 0) + 1

        inertia = float(self.kmeans.inertia_)

        logger.info(
            "K-Means training complete: %d tracks, %d clusters, inertia=%.2f",
            len(music_ids),
            effective_clusters,
            inertia,
        )

        return {
            "status": "success",
            "total_tracks": len(music_ids),
            "n_clusters": effective_clusters,
            "inertia": inertia,
            "cluster_distribution": cluster_counts,
        }

    # ------------------------------------------------------------------
    # Recommendations
    # ------------------------------------------------------------------

    def get_recommendations(
        self,
        music_id: int,
        db: Session,
        user_id: int,
        limit: int = DEFAULT_TOP_N,
        algorithm: int = 3,
    ) -> List[Dict]:
        """
        Generate recommendations for a given track.

        Args:
            music_id: Source track ID.
            db: SQLAlchemy session.
            user_id: Current user ID (for saving recommendations).
            limit: Maximum recommendations to return.
            algorithm: 1=cosine, 2=euclidean, 3=cluster-aware cosine.

        Returns:
            List of recommendation dicts sorted by similarity (descending).
        """
        # 1. Get source features
        source_af = (
            db.query(AudioFeatures)
            .filter(AudioFeatures.music_id == music_id)
            .first()
        )
        if source_af is None:
            return []

        source_dict = self._features_to_dict(source_af)
        source_vec = extract_feature_vector(source_dict)
        if source_vec is None:
            return []

        source_vec = np.array(source_vec, dtype=np.float64).reshape(1, -1)

        # 2. Select candidate pool
        if algorithm == 3 and source_af.cluster_id is not None:
            # Cluster-aware: first try same cluster, expand if too few
            candidates = (
                db.query(AudioFeatures)
                .filter(
                    AudioFeatures.cluster_id == source_af.cluster_id,
                    AudioFeatures.music_id != music_id,
                )
                .all()
            )
            # If not enough candidates in same cluster, add neighbouring clusters
            if len(candidates) < limit:
                extra = (
                    db.query(AudioFeatures)
                    .filter(
                        AudioFeatures.music_id != music_id,
                        AudioFeatures.cluster_id != source_af.cluster_id,
                    )
                    .all()
                )
                candidates.extend(extra)
        else:
            candidates = (
                db.query(AudioFeatures)
                .filter(AudioFeatures.music_id != music_id)
                .all()
            )

        if not candidates:
            return []

        # 3. Build candidate matrix
        cand_matrix, cand_ids = self._build_feature_matrix(candidates)
        if len(cand_ids) == 0:
            return []

        # 4. Scale if scaler is available
        if self.scaler is not None:
            source_scaled = self.scaler.transform(source_vec)
            cand_scaled = self.scaler.transform(cand_matrix)
        else:
            source_scaled = source_vec
            cand_scaled = cand_matrix

        # 5. Compute similarity / distance
        if algorithm == 2:
            # Euclidean distance → convert to similarity
            diffs = cand_scaled - source_scaled
            distances = np.linalg.norm(diffs, axis=1)
            max_dist = distances.max() if distances.max() > 0 else 1.0
            scores = 1.0 - (distances / max_dist)
        else:
            # Cosine similarity (algorithm 1 or 3)
            sim_matrix = cosine_similarity(source_scaled, cand_scaled)
            scores = sim_matrix[0]
            # Normalize from [-1,1] to [0,1]
            scores = (scores + 1.0) / 2.0

        # 6. Rank and take top-N
        ranked_indices = np.argsort(scores)[::-1][:limit]

        # 7. Build result list and persist recommendations
        results: List[Dict] = []
        for idx in ranked_indices:
            cand_music_id = cand_ids[idx]
            similarity_score = float(np.clip(scores[idx], 0.0, 1.0))

            # Save Recommendation record
            rec = Recommendation(
                user_id=user_id,
                source_music_id=music_id,
                recommended_music_id=cand_music_id,
                similarity_score=similarity_score,
                algorithm=algorithm,
            )
            db.add(rec)

            # Load music metadata for response
            recommended_music = (
                db.query(Music).filter(Music.id == cand_music_id).first()
            )

            results.append(
                {
                    "recommended_music_id": cand_music_id,
                    "similarity_score": similarity_score,
                    "algorithm": algorithm,
                    "recommended_music": recommended_music,
                }
            )

        db.commit()

        logger.info(
            "Generated %d recommendations for music_id=%d (algorithm=%d)",
            len(results),
            music_id,
            algorithm,
        )

        return results

    # ------------------------------------------------------------------
    # Cluster information
    # ------------------------------------------------------------------

    def get_cluster_info(self, db: Session) -> Dict:
        """
        Return cluster distribution statistics.

        Returns:
            Dictionary with cluster counts and centroids info.
        """
        features = db.query(AudioFeatures).filter(AudioFeatures.cluster_id.isnot(None)).all()

        if not features:
            return {
                "status": "no_clusters",
                "message": "No clusters found. Run training first.",
            }

        cluster_counts: Dict[int, int] = {}
        cluster_music: Dict[int, List[int]] = {}

        for af in features:
            cid = af.cluster_id
            cluster_counts[cid] = cluster_counts.get(cid, 0) + 1
            cluster_music.setdefault(cid, []).append(af.music_id)

        return {
            "status": "ok",
            "total_clustered_tracks": len(features),
            "n_clusters": len(cluster_counts),
            "cluster_distribution": cluster_counts,
            "cluster_music_ids": cluster_music,
        }
