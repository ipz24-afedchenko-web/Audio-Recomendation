import librosa
import logging
import numpy as np
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# Canonical genre vocabulary injected into the recommendation feature
# vector (W4-1).  Keeping this a fixed, ordered list guarantees the feature
# vector has a constant length across clustering and recommendation passes,
# which the StandardScaler in MLRecommender depends on.  Tracks whose genre
# is not in this list are mapped to the final "other" bucket; tracks with no
# genre at all get an all-zero genre vector so they are not artificially
# clustered together.
GENRE_VOCABULARY = [
    "rock", "pop", "metal", "jazz", "classical", "electronic",
    "hip-hop", "rap", "country", "folk", "blues", "reggae",
    "r&b", "soul", "punk", "indie", "ambient", "dance", "techno",
    "house", "disco", "funk", "world", "soundtrack", "lo-fi",
]

# A few common spelling/alias normalisations so e.g. "Hip Hop" and "hip-hop"
# collapse to the same bucket.
_GENRE_SYNONYMS = {
    "hip hop": "hip-hop",
    "rnb": "r&b",
    "rhythm and blues": "r&b",
    "r&b": "r&b",
    "lofi": "lo-fi",
    "lo fi": "lo-fi",
    "electronica": "electronic",
}


def _normalize_genre(genre: Optional[str]) -> Optional[str]:
    """Lower-case, strip and apply known synonym mappings."""
    if not genre:
        return None
    g = str(genre).strip().lower()
    return _GENRE_SYNONYMS.get(g, g)


def genre_to_title_case(genre: Optional[str]) -> Optional[str]:
    """Convert a genre string to Title Case, handling comma-separated lists.

    Each genre in a comma-separated list is individually converted so that
    e.g. "alternative rock" → "Alternative Rock" and "hip-hop, pop" →
    "Hip-Hop, Pop".  Returns ``None`` for falsy input.
    """
    if not genre:
        return None
    return ", ".join(
        g.strip().title() for g in str(genre).split(",") if g.strip()
    )


def genre_to_vector(
    genre: Optional[str], vocab: List[str] = GENRE_VOCABULARY
) -> List[float]:
    """
    Encode a genre string into a fixed-length one-hot vector.

    Length is ``len(vocab) + 1`` — the final element is the "other" bucket
    for out-of-vocabulary genres.  A missing/empty genre yields an all-zero
    vector (neutral, no genre signal) so unlabelled tracks are not forced
    into a shared cluster.
    """
    vec = [0.0] * (len(vocab) + 1)
    g = _normalize_genre(genre)
    if g is None:
        return vec
    if g in vocab:
        vec[vocab.index(g)] = 1.0
    else:
        vec[-1] = 1.0
    return vec


def audio_features_to_dict(af) -> Dict:
    """
    Convert an AudioFeatures ORM instance (or any object with the same
    attributes) into a plain dict used for ML vector extraction.

    Centralised here so MLRecommender, GenreClassifier and any future
    consumers stay in sync.  Pass-through of None for missing columns
    is intentional — the downstream ``extract_feature_vector`` handles
    missing values.
    """
    return {
        "tempo": getattr(af, "tempo", None),
        "key": getattr(af, "key", None),
        "mode": getattr(af, "mode", None),
        "energy": getattr(af, "energy", None),
        "valence": getattr(af, "valence", None),
        "loudness": getattr(af, "loudness", None),
        "spectral_centroid_mean": getattr(af, "spectral_centroid_mean", None),
        "mfcc_mean": getattr(af, "mfcc_mean", None),
    }


def normalize_features(features: Dict) -> Dict:
    """
    Normalize audio features to 0-1 range for ML algorithms.

    Args:
        features: Dictionary of raw audio features

    Returns:
        Dictionary of normalized features
    """
    normalized = features.copy()

    # Tempo normalization (assume 40-200 BPM range)
    if features.get("tempo") is not None:
        normalized["tempo_normalized"] = np.clip((features["tempo"] - 40) / 160, 0, 1)

    # Loudness normalization (assume -60 to 0 dB range)
    if features.get("loudness") is not None:
        normalized["loudness_normalized"] = np.clip((features["loudness"] + 60) / 60, 0, 1)

    # Energy already normalized to 0-1

    # Valence already normalized to 0-1

    # Spectral features normalization
    if features.get("spectral_centroid_mean") is not None:
        # Typical range: 0-8000 Hz
        normalized["spectral_centroid_normalized"] = np.clip(
            features["spectral_centroid_mean"] / 8000, 0, 1
        )

    return normalized


# Sentinel marking "genre not requested" so the legacy audio-only vector
# length (30) is preserved when callers such as GenreClassifier omit genre,
# while MLRecommender always passes an explicit value (including None for
# unlabelled tracks) to get the genre-aware vector.
_UNSET = object()


def extract_feature_vector(
    features: Dict, genre: Optional[str] = _UNSET
) -> Optional[List[float]]:
    """
    Extract a fixed-length feature vector from audio features for ML algorithms.

    Uses the most important features for similarity comparison:
    - Tempo (normalized)
    - Key (one-hot encoded, 12 values)
    - Mode
    - Energy
    - Valence
    - Spectral centroid (normalized)
    - MFCCs (mean, first 13 coefficients)
    - Genre (one-hot over :data:`GENRE_VOCABULARY` + "other", W4-1)

    Args:
        features: Dictionary of audio features
        genre: Optional genre string.  When provided (including ``None``,
            which yields a neutral all-zero genre block) the vector length
            grows by ``len(GENRE_VOCABULARY) + 1`` so the recommendation
            clusters become genre-aware.  Omit for the legacy audio-only
            vector (e.g. GenreClassifier training).

    Returns:
        List of floats representing the feature vector, or None if essential features missing
    """
    try:
        vector = []

        # Tempo (normalized)
        if features.get("tempo") is not None:
            tempo_norm = np.clip((features["tempo"] - 40) / 160, 0, 1)
            vector.append(float(tempo_norm))
        else:
            return None

        # Key (one-hot encoding for 12 pitch classes)
        if features.get("key") is not None:
            key_one_hot = [0.0] * 12
            key_one_hot[features["key"]] = 1.0
            vector.extend(key_one_hot)
        else:
            vector.extend([0.0] * 12)

        # Mode
        if features.get("mode") is not None:
            vector.append(float(features["mode"]))
        else:
            vector.append(0.5)  # neutral

        # Energy
        if features.get("energy") is not None:
            vector.append(float(features["energy"]))
        else:
            return None

        # Valence
        if features.get("valence") is not None:
            vector.append(float(features["valence"]))
        else:
            vector.append(0.5)  # neutral

        # Spectral centroid (normalized)
        if features.get("spectral_centroid_mean") is not None:
            centroid_norm = np.clip(features["spectral_centroid_mean"] / 8000, 0, 1)
            vector.append(float(centroid_norm))
        else:
            vector.append(0.5)

        # MFCCs (first 13 coefficients, normalized)
        if features.get("mfcc_mean") is not None and len(features["mfcc_mean"]) >= 13:
            mfccs = features["mfcc_mean"][:13]
            # Normalize MFCCs to 0-1 range (typical range: -50 to 50)
            mfccs_normalized = [np.clip((mfcc + 50) / 100, 0, 1) for mfcc in mfccs]
            vector.extend(mfccs_normalized)
        else:
            vector.extend([0.5] * 13)

        # Genre (W4-1): one-hot over the canonical vocabulary + "other".
        # Appended only when the caller explicitly requests it (including an
        # explicit None for an unlabelled track) so the legacy audio-only
        # vector length stays 30 for callers that omit the argument.
        if genre is not _UNSET:
            vector.extend(genre_to_vector(genre))

        return vector

    except Exception as e:
        logger.warning("Error extracting feature vector: %s", str(e))
        return None


def calculate_feature_similarity(features1: Dict, features2: Dict) -> Optional[float]:
    """
    Calculate similarity between two feature sets using cosine similarity.

    Args:
        features1: First feature dictionary
        features2: Second feature dictionary

    Returns:
        Similarity score (0.0-1.0) or None if vectors cannot be extracted
    """
    try:
        vec1 = extract_feature_vector(features1)
        vec2 = extract_feature_vector(features2)

        if vec1 is None or vec2 is None:
            return None

        # Cosine similarity
        vec1_arr = np.array(vec1)
        vec2_arr = np.array(vec2)

        dot_product = np.dot(vec1_arr, vec2_arr)
        norm1 = np.linalg.norm(vec1_arr)
        norm2 = np.linalg.norm(vec2_arr)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        similarity = dot_product / (norm1 * norm2)

        # Convert from [-1, 1] to [0, 1]
        similarity_normalized = (similarity + 1) / 2

        return float(similarity_normalized)

    except Exception as e:
        logger.warning("Error calculating feature similarity: %s", str(e))
        return None


# ------------------------------------------------------------------
# Perceptual fingerprint (format-robust audio identification)
# ------------------------------------------------------------------

FINGERPRINT_N_MELS = 32
FINGERPRINT_DURATION = 30  # seconds — enough to identify a song


def compute_perceptual_fingerprint(y: np.ndarray, sr: int) -> Optional[List[float]]:
    """
    Build a compact perceptual fingerprint from an audio signal.

    The fingerprint is a 64-dimensional vector (mean + std of a 32-band
    mel-spectrogram over the first ``FINGERPRINT_DURATION`` seconds).
    Because it operates on the perceptual mel scale, it is robust to
    different audio encodings (MP3 vs WAV), bitrates, and small EQ
    differences.

    Returns None if the audio is too short to fingerprint.
    """
    try:
        # Take only the first N seconds
        max_samples = int(FINGERPRINT_DURATION * sr)
        if len(y) < sr:  # less than 1 second — too short
            return None
        y_segment = y[:max_samples]

        # Mel-spectrogram
        mel = librosa.feature.melspectrogram(
            y=y_segment, sr=sr,
            n_mels=FINGERPRINT_N_MELS,
            fmax=sr // 2,
        )
        log_mel = librosa.power_to_db(mel, ref=np.max)

        # Mean + std across time → 64-dim vector
        fp_mean = np.mean(log_mel, axis=1).tolist()
        fp_std = np.std(log_mel, axis=1).tolist()

        return fp_mean + fp_std
    except Exception as e:
        logger.warning("Error computing perceptual fingerprint: %s", str(e))
        return None


def fingerprint_similarity(fp_a: List[float], fp_b: List[float]) -> float:
    """
    Cosine similarity between two perceptual fingerprints.

    Returns 0.0–1.0.  Values above 0.92 generally indicate the same
    recording (different encodings or bitrates).
    """
    a = np.array(fp_a, dtype=np.float64)
    b = np.array(fp_b, dtype=np.float64)
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    sim = dot / norm
    return float((sim + 1.0) / 2.0)  # [-1,1] → [0,1]


def extract_feature_vector_length(include_genre: bool = True) -> int:
    """
    Return the fixed length of vectors produced by :func:`extract_feature_vector`.

    Used by MLRecommender to detect and discard stale persisted scaler/KMeans
    models that were trained on a different vector dimensionality (e.g. before
    the genre signal was added in W4-1).
    """
    dummy = {
        "tempo": 120.0,
        "key": 0,
        "mode": 1,
        "energy": 0.5,
        "valence": 0.5,
        "spectral_centroid_mean": 1000.0,
        "mfcc_mean": [0.0] * 20,
    }
    vec = extract_feature_vector(
        dummy, genre="rock" if include_genre else _UNSET
    )
    return len(vec)


def get_feature_weights() -> Dict[str, float]:
    """
    Get weights for different feature categories in similarity calculation.

    Returns:
        Dictionary of feature weights
    """
    return {
        "temporal": 1.0,  # tempo
        "tonal": 0.8,     # key, mode
        "energy": 1.2,    # loudness, energy
        "spectral": 1.0,  # spectral features
        "timbre": 1.5,    # MFCCs (most important for timbre)
        "rhythm": 0.7,    # zero-crossing rate
        "harmony": 0.9    # chroma features
    }
