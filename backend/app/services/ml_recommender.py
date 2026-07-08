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
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler
import joblib
from sqlalchemy.orm import Session

from app.models.audio_features import AudioFeatures
from app.models.music import Music
from app.models.recommendation import Recommendation
from app.utils.audio_utils import audio_features_to_dict, extract_feature_vector, fingerprint_similarity

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

    # Auto-retrain thresholds.  Fit a new KMeans only when the corpus
    # has grown by at least this fraction since the last fit, OR when
    # fewer than MIN_TRACKS_FOR_CLUSTERING tracks existed (i.e. first fit).
    AUTO_RETRAIN_GROWTH_RATIO = 0.25
    MIN_TRACKS_FOR_CLUSTERING = 5

    def __init__(
        self,
        n_clusters: int = DEFAULT_N_CLUSTERS,
        random_state: int = 42,
        auto_tune: bool = True,
    ):
        self.n_clusters = n_clusters
        self.random_state = random_state
        self.auto_tune = auto_tune

        self.kmeans: Optional[KMeans] = None
        self.scaler: Optional[StandardScaler] = None
        self._last_fit_n_tracks: int = 0
        self._silhouette_score: Optional[float] = None
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
                # We do not know the exact count from disk; assume the
                # cluster assignments in the DB reflect the last fit.
                # This is good enough for the auto-retrain heuristic.
                logger.info("Models loaded successfully from disk")
                return True
            except Exception as e:
                logger.error("Failed to load models: %s", str(e))
                return False
        return False

    # ------------------------------------------------------------------
    # Auto-retrain heuristic
    # ------------------------------------------------------------------

    def should_auto_retrain(self, db: Session) -> bool:
        """
        Return True when the corpus has grown enough to justify a fresh
        K-Means fit.  Cheap to call — just counts rows.
        """
        n_tracks = db.query(AudioFeatures).count()
        if n_tracks < self.MIN_TRACKS_FOR_CLUSTERING:
            return False
        if self._last_fit_n_tracks == 0:
            return True
        growth = (n_tracks - self._last_fit_n_tracks) / max(self._last_fit_n_tracks, 1)
        return growth >= self.AUTO_RETRAIN_GROWTH_RATIO

    def auto_retrain_if_needed(self, db: Session) -> Optional[Dict]:
        """Fit clusters only when ``should_auto_retrain`` says so."""
        if not self.should_auto_retrain(db):
            return None
        result = self.fit_clusters(db)
        self._last_fit_n_tracks = result.get("total_tracks", 0) if result.get("status") == "success" else 0
        return result

    # ------------------------------------------------------------------
    # Feature extraction helpers
    # ------------------------------------------------------------------

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
            feat_dict = audio_features_to_dict(af)
            vec = extract_feature_vector(feat_dict)
            if vec is not None:
                vectors.append(vec)
                music_ids.append(af.music_id)

        if not vectors:
            return np.array([]), []

        return np.array(vectors, dtype=np.float64), music_ids

    # ------------------------------------------------------------------
    # Optimal K search
    # ------------------------------------------------------------------

    @staticmethod
    def _find_optimal_clusters(
        matrix_scaled: np.ndarray,
        max_k: Optional[int] = None,
        random_state: int = 42,
    ) -> Tuple[int, float]:
        """
        Find the optimal number of clusters via silhouette score.

        Searches k from 2 to ``max_k`` (default: sqrt(N), clamped to
        N-1) and returns the k with the highest score.

        Returns:
            (optimal_k, silhouette_score)
        """
        n_samples = matrix_scaled.shape[0]
        if max_k is None:
            max_k = min(int(np.sqrt(n_samples)), n_samples - 1)
        max_k = min(max_k, n_samples - 1)
        if max_k < 2:
            return 1, -1.0

        best_k = 2
        best_score = -1.0
        for k in range(2, max_k + 1):
            km = KMeans(n_clusters=k, random_state=random_state, n_init=10)
            labels = km.fit_predict(matrix_scaled)
            score = silhouette_score(matrix_scaled, labels)
            if score > best_score:
                best_score = score
                best_k = k
        return best_k, float(best_score)

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

        # Fit scaler
        self.scaler = StandardScaler()
        matrix_scaled = self.scaler.fit_transform(matrix)

        # Determine number of clusters
        if self.auto_tune and len(music_ids) >= 4:
            optimal_k, sil_score = self._find_optimal_clusters(
                matrix_scaled,
                max_k=min(self.n_clusters, len(music_ids) - 1),
                random_state=self.random_state,
            )
            effective_clusters = optimal_k
            self._silhouette_score = sil_score
        else:
            effective_clusters = min(self.n_clusters, len(music_ids))

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
        self._last_fit_n_tracks = len(music_ids)

        # Save models to disk
        self.save_models()

        # Compute cluster statistics
        cluster_counts = {}
        for label in labels:
            cluster_counts[int(label)] = cluster_counts.get(int(label), 0) + 1

        inertia = float(self.kmeans.inertia_)
        sil_score = self._silhouette_score

        log_parts = [
            "K-Means training complete: %d tracks, %d clusters, inertia=%.2f",
            len(music_ids),
            effective_clusters,
            inertia,
        ]
        if sil_score is not None:
            log_parts[0] += ", silhouette=%.3f"
            log_parts.append(sil_score)
        logger.info(*log_parts)

        return {
            "status": "success",
            "total_tracks": len(music_ids),
            "n_clusters": effective_clusters,
            "inertia": inertia,
            "silhouette_score": sil_score,
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

        History semantics: the *current* (source_music, user, algorithm)
        triple is upserted — old rows for the same triple are deleted
        first so callers always see the latest ranking.  Rows for other
        algorithms or other users are preserved (analytics use case).

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

        source_dict = audio_features_to_dict(source_af)
        source_vec = extract_feature_vector(source_dict)
        if source_vec is None:
            return []

        source_vec = np.array(source_vec, dtype=np.float64).reshape(1, -1)

        # 2. Select candidate pool
        if algorithm == 3 and source_af.cluster_id is not None:
            candidates = (
                db.query(AudioFeatures)
                .filter(
                    AudioFeatures.cluster_id == source_af.cluster_id,
                    AudioFeatures.music_id != music_id,
                )
                .all()
            )
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
            diffs = cand_scaled - source_scaled
            distances = np.linalg.norm(diffs, axis=1)
            max_dist = distances.max() if distances.max() > 0 else 1.0
            scores = 1.0 - (distances / max_dist)
        else:
            sim_matrix = cosine_similarity(source_scaled, cand_scaled)
            scores = sim_matrix[0]
            scores = (scores + 1.0) / 2.0

        # 6. Rank and take top-N
        ranked_indices = np.argsort(scores)[::-1][:limit]

        # 7. UPSERT semantics: drop only the rows for THIS (user, source,
        # algorithm) triple, then insert the new top-N.  History for other
        # algorithms / sources is preserved.
        db.query(Recommendation).filter(
            Recommendation.user_id == user_id,
            Recommendation.source_music_id == music_id,
            Recommendation.algorithm == algorithm,
        ).delete(synchronize_session=False)
        db.flush()

        # 8. Build result list.  We deliberately do NOT query Music once
        # per row — instead we batch-load all recommended tracks in a
        # single query (eliminates the N+1 from the previous version).
        top_ids = [cand_ids[idx] for idx in ranked_indices]
        music_by_id: Dict[int, Music] = {
            m.id: m
            for m in db.query(Music).filter(Music.id.in_(top_ids)).all()
        }

        results: List[Dict] = []
        for idx in ranked_indices:
            cand_music_id = cand_ids[idx]
            similarity_score = float(np.clip(scores[idx], 0.0, 1.0))

            rec = Recommendation(
                user_id=user_id,
                source_music_id=music_id,
                recommended_music_id=cand_music_id,
                similarity_score=similarity_score,
                algorithm=algorithm,
            )
            db.add(rec)

            results.append(
                {
                    "recommended_music_id": cand_music_id,
                    "similarity_score": similarity_score,
                    "algorithm": algorithm,
                    "recommended_music": music_by_id.get(cand_music_id),
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
    # Perceptual deduplication (format-robust)
    # ------------------------------------------------------------------

    PERCEPTUAL_DUP_THRESHOLD = 0.92

    def find_perceptual_duplicates(
        self,
        music_id: int,
        db: Session,
        user_id: int,
        threshold: float = PERCEPTUAL_DUP_THRESHOLD,
    ) -> List[Dict]:
        """
        Find tracks that sound like the same recording (different format
        or bitrate) by comparing perceptual fingerprints.

        The fingerprint is a 64-dim mel-spectrogram vector computed
        during audio analysis.  Two fingerprints whose cosine similarity
        exceeds ``threshold`` are considered perceptual duplicates.

        Returns a list of dicts with keys:
            music_id, title, artist, file_path, similarity, file_hash
        """
        source_af = (
            db.query(AudioFeatures)
            .filter(AudioFeatures.music_id == music_id)
            .first()
        )
        if source_af is None or source_af.perceptual_fingerprint is None:
            return []

        candidates = (
            db.query(AudioFeatures)
            .join(Music, AudioFeatures.music_id == Music.id)
            .filter(
                AudioFeatures.music_id != music_id,
                AudioFeatures.perceptual_fingerprint.isnot(None),
                Music.user_id == user_id,
            )
            .all()
        )

        results: List[Dict] = []
        for af in candidates:
            sim = fingerprint_similarity(
                source_af.perceptual_fingerprint,
                af.perceptual_fingerprint,
            )
            if sim >= threshold:
                m = af.music
                results.append({
                    "music_id": af.music_id,
                    "title": m.title if m else None,
                    "artist": m.artist if m else None,
                    "file_hash": m.file_hash if m else None,
                    "similarity": round(sim, 4),
                })

        results.sort(key=lambda r: r["similarity"], reverse=True)
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
