import librosa
import numpy as np
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


class AudioAnalyzer:
    """
    Audio analysis service using librosa for feature extraction.

    Extracts various audio features including:
    - Temporal: tempo, duration
    - Tonal: key, mode
    - Energy: loudness, energy
    - Mood: valence
    - Spectral: centroid, bandwidth, rolloff
    - Timbre: MFCCs
    - Rhythm: zero-crossing rate
    - Harmony: chroma features
    """

    def __init__(self, sr: int = 22050, n_mfcc: int = 20):
        """
        Initialize AudioAnalyzer.

        Args:
            sr: Sample rate for audio loading (default: 22050 Hz)
            n_mfcc: Number of MFCC coefficients to extract (default: 20)
        """
        self.sr = sr
        self.n_mfcc = n_mfcc

    def analyze(self, file_path: str) -> Dict:
        """
        Analyze an audio file and extract all features.

        Args:
            file_path: Path to the audio file

        Returns:
            Dictionary containing all extracted features

        Raises:
            Exception: If audio file cannot be loaded or analyzed
        """
        try:
            # Load audio file
            y, sr = librosa.load(file_path, sr=self.sr)

            # Extract all features
            features = {
                **self._extract_temporal_features(y, sr),
                **self._extract_tonal_features(y, sr),
                **self._extract_energy_features(y, sr),
                **self._extract_spectral_features(y, sr),
                **self._extract_timbre_features(y, sr),
                **self._extract_rhythm_features(y, sr),
                **self._extract_harmony_features(y, sr),
            }

            return features

        except Exception as e:
            logger.error(f"Error analyzing audio file {file_path}: {str(e)}")
            raise

    def _extract_temporal_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract tempo and duration."""
        try:
            # Tempo detection
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

            # Duration in seconds
            duration = librosa.get_duration(y=y, sr=sr)

            return {
                "tempo": float(tempo),
                "duration": float(duration)
            }
        except Exception as e:
            logger.warning(f"Error extracting temporal features: {str(e)}")
            return {"tempo": None, "duration": None}

    def _extract_tonal_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract key and mode."""
        try:
            # Compute chromagram
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

            # Get the most prominent pitch class
            key = int(np.argmax(np.sum(chroma, axis=1)))

            # Estimate mode (major=1, minor=0) based on chord structure
            # Simplified approach: check if major third (4 semitones) is stronger than minor third (3 semitones)
            major_third = chroma[(key + 4) % 12].mean()
            minor_third = chroma[(key + 3) % 12].mean()
            mode = 1 if major_third > minor_third else 0

            return {
                "key": key,  # 0=C, 1=C#, 2=D, ..., 11=B
                "mode": mode  # 0=minor, 1=major
            }
        except Exception as e:
            logger.warning(f"Error extracting tonal features: {str(e)}")
            return {"key": None, "mode": None}

    def _extract_energy_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract loudness and energy."""
        try:
            # Loudness (in dB)
            rms = librosa.feature.rms(y=y)[0]
            loudness = float(librosa.amplitude_to_db(rms.mean(), ref=np.max))

            # Energy (normalized RMS)
            energy = float(rms.mean())

            # Normalize energy to 0-1 range
            energy_normalized = min(energy / 0.1, 1.0)  # 0.1 is approximate max RMS

            return {
                "loudness": loudness,
                "energy": energy_normalized
            }
        except Exception as e:
            logger.warning(f"Error extracting energy features: {str(e)}")
            return {"loudness": None, "energy": None}

    def _extract_spectral_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract spectral centroid, bandwidth, and rolloff."""
        try:
            # Spectral centroid
            spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

            # Spectral bandwidth
            spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]

            # Spectral rolloff
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]

            return {
                "spectral_centroid_mean": float(np.mean(spectral_centroids)),
                "spectral_centroid_std": float(np.std(spectral_centroids)),
                "spectral_bandwidth_mean": float(np.mean(spectral_bandwidth)),
                "spectral_bandwidth_std": float(np.std(spectral_bandwidth)),
                "spectral_rolloff_mean": float(np.mean(spectral_rolloff)),
                "spectral_rolloff_std": float(np.std(spectral_rolloff))
            }
        except Exception as e:
            logger.warning(f"Error extracting spectral features: {str(e)}")
            return {
                "spectral_centroid_mean": None,
                "spectral_centroid_std": None,
                "spectral_bandwidth_mean": None,
                "spectral_bandwidth_std": None,
                "spectral_rolloff_mean": None,
                "spectral_rolloff_std": None
            }

    def _extract_timbre_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract MFCC (Mel-frequency cepstral coefficients) for timbre."""
        try:
            # Extract MFCCs
            mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=self.n_mfcc)

            # Compute mean and std for each coefficient
            mfcc_mean = np.mean(mfccs, axis=1).tolist()
            mfcc_std = np.std(mfccs, axis=1).tolist()

            return {
                "mfcc_mean": mfcc_mean,
                "mfcc_std": mfcc_std
            }
        except Exception as e:
            logger.warning(f"Error extracting timbre features: {str(e)}")
            return {"mfcc_mean": None, "mfcc_std": None}

    def _extract_rhythm_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract zero-crossing rate."""
        try:
            # Zero-crossing rate
            zcr = librosa.feature.zero_crossing_rate(y)[0]

            return {
                "zero_crossing_rate_mean": float(np.mean(zcr)),
                "zero_crossing_rate_std": float(np.std(zcr))
            }
        except Exception as e:
            logger.warning(f"Error extracting rhythm features: {str(e)}")
            return {
                "zero_crossing_rate_mean": None,
                "zero_crossing_rate_std": None
            }

    def _extract_harmony_features(self, y: np.ndarray, sr: int) -> Dict:
        """Extract chroma STFT features."""
        try:
            # Chroma STFT (12 pitch classes)
            chroma_stft = librosa.feature.chroma_stft(y=y, sr=sr)

            # Compute mean and std for each pitch class
            chroma_mean = np.mean(chroma_stft, axis=1).tolist()
            chroma_std = np.std(chroma_stft, axis=1).tolist()

            return {
                "chroma_stft_mean": chroma_mean,
                "chroma_stft_std": chroma_std
            }
        except Exception as e:
            logger.warning(f"Error extracting harmony features: {str(e)}")
            return {"chroma_stft_mean": None, "chroma_stft_std": None}

    def estimate_valence(self, features: Dict) -> Optional[float]:
        """
        Estimate valence (musical positivity) from extracted features.

        This is a simplified heuristic based on:
        - Mode (major = more positive)
        - Tempo (faster = more positive)
        - Energy (higher = more positive)

        Args:
            features: Dictionary of extracted features

        Returns:
            Valence score (0.0-1.0) or None if cannot be estimated
        """
        try:
            valence_score = 0.0
            count = 0

            # Mode contribution (major is more positive)
            if features.get("mode") is not None:
                valence_score += features["mode"]  # 0 or 1
                count += 1

            # Tempo contribution (normalized)
            if features.get("tempo") is not None:
                tempo_normalized = min(features["tempo"] / 180.0, 1.0)  # 180 BPM as max
                valence_score += tempo_normalized
                count += 1

            # Energy contribution
            if features.get("energy") is not None:
                valence_score += features["energy"]
                count += 1

            if count == 0:
                return None

            return float(valence_score / count)

        except Exception as e:
            logger.warning(f"Error estimating valence: {str(e)}")
            return None
