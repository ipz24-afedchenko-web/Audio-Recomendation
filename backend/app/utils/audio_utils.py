import numpy as np
from typing import Dict, List, Optional


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


def extract_feature_vector(features: Dict) -> Optional[List[float]]:
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

    Args:
        features: Dictionary of audio features

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

        return vector

    except Exception as e:
        print(f"Error extracting feature vector: {str(e)}")
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
        print(f"Error calculating feature similarity: {str(e)}")
        return None


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
