"""
Model Training Script

Standalone script for batch training of ML models:
- K-Means clustering (MLRecommender)
- Genre classifier (GenreClassifier)

Usage:
    cd backend
    python -m app.services.train_models [--clusters N] [--genre] [--all]
"""

import argparse
import logging
import sys
import os

# Add backend directory to path so imports work when run as script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.database import SessionLocal
from app.services.ml_recommender import MLRecommender
from app.services.genre_classifier import GenreClassifier

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def train_clusters(n_clusters: int = 8) -> None:
    """Train K-Means clustering model."""
    logger.info("=" * 60)
    logger.info("Training K-Means clustering (n_clusters=%d)", n_clusters)
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        recommender = MLRecommender(n_clusters=n_clusters)
        result = recommender.fit_clusters(db)

        if result["status"] == "success":
            logger.info("✅ Clustering complete!")
            logger.info("   Total tracks: %d", result["total_tracks"])
            logger.info("   Clusters: %d", result["n_clusters"])
            logger.info("   Inertia: %.2f", result["inertia"])
            logger.info("   Distribution: %s", result["cluster_distribution"])
        else:
            logger.error("❌ Clustering failed: %s", result.get("message", "Unknown error"))
    finally:
        db.close()


def train_genre_classifier() -> None:
    """Train genre classification model."""
    logger.info("=" * 60)
    logger.info("Training Genre Classifier (Random Forest)")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        classifier = GenreClassifier()
        result = classifier.train(db)

        if result["status"] == "success":
            logger.info("✅ Genre classifier trained!")
            logger.info("   Total samples: %d", result["total_samples"])
            logger.info("   Classes: %s", result["classes"])
            logger.info("   Accuracy: %.2f%%", result["accuracy"] * 100)
        else:
            logger.error("❌ Genre classifier training failed: %s", result.get("message", "Unknown error"))
    finally:
        db.close()


def predict_genres() -> None:
    """Predict genres for unlabelled tracks."""
    logger.info("=" * 60)
    logger.info("Predicting genres for unlabelled tracks")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        classifier = GenreClassifier()
        result = classifier.predict_batch(db)

        if result["status"] == "success":
            logger.info("✅ Predicted %d genres", result["predicted"])
        else:
            logger.info("ℹ️  %s", result.get("message", ""))
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train ML models for the Music Recommender system"
    )
    parser.add_argument(
        "--clusters",
        type=int,
        default=8,
        help="Number of K-Means clusters (default: 8)",
    )
    parser.add_argument(
        "--genre",
        action="store_true",
        help="Train genre classifier only",
    )
    parser.add_argument(
        "--predict-genres",
        action="store_true",
        help="Predict genres for unlabelled tracks",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Train all models (clustering + genre classifier)",
    )

    args = parser.parse_args()

    if args.all:
        train_clusters(args.clusters)
        print()
        train_genre_classifier()
        print()
        predict_genres()
    elif args.genre:
        train_genre_classifier()
    elif args.predict_genres:
        predict_genres()
    else:
        # Default: train clusters
        train_clusters(args.clusters)

    logger.info("Done!")


if __name__ == "__main__":
    main()
