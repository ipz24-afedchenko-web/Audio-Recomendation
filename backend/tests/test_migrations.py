"""
Tests for Alembic migrations (W4-5 / W4-8).

Revision chain verification via module import.  Index existence is
verified against the ORM model directly (SQLAlchemy creates the index
from ``__table_args__`` when the table is created).
"""

import importlib.util
import os


def _load_migration(file_path: str, label: str):
    spec = importlib.util.spec_from_file_location(
        label, os.path.abspath(file_path)
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_008_revision_chain():
    p = os.path.join(
        os.path.dirname(__file__),
        "..", "alembic", "versions",
        "008_add_updated_at_triggers.py",
    )
    mod = _load_migration(p, "m008_triggers")
    assert mod.revision == "008"
    assert mod.down_revision == "007"


def test_migration_009_revision_chain():
    p = os.path.join(
        os.path.dirname(__file__),
        "..", "alembic", "versions",
        "009_add_algorithm_time_index.py",
    )
    mod = _load_migration(p, "m009_algo_time")
    assert mod.revision == "009"
    assert mod.down_revision == "008"


def test_algorithm_time_index_in_model():
    """The ix_ab_algorithm_time index is declared in __table_args__."""
    from app.models.algorithm_event import AlgorithmEvent
    names = [idx.name for idx in AlgorithmEvent.__table_args__]
    assert "ix_ab_algorithm_time" in names


def test_migration_010_revision_chain():
    p = os.path.join(
        os.path.dirname(__file__),
        "..", "alembic", "versions",
        "010_hybrid_source_model.py",
    )
    mod = _load_migration(p, "m010_hybrid")
    assert mod.revision == "010"
    assert mod.down_revision == "009"


def test_music_partial_indexes_in_model():
    """Hybrid dedup indexes are declared on Music.__table_args__."""
    from app.models.music import Music
    names = [idx.name for idx in Music.__table_args__ if hasattr(idx, "name")]
    assert "ix_music_user_hash" in names
    assert "ix_music_user_external" in names
    assert "ix_music_source" in names


def test_audio_features_feature_origin_in_model():
    from app.models.audio_features import AudioFeatures
    assert "feature_origin" in AudioFeatures.__table__.columns

