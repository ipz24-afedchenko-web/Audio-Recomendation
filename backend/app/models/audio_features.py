from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class AudioFeatures(Base):
    __tablename__ = "audio_features"

    id = Column(Integer, primary_key=True, index=True)
    music_id = Column(Integer, ForeignKey("music.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Temporal features
    tempo = Column(Float, nullable=True)  # BPM (beats per minute)
    duration = Column(Float, nullable=True)  # seconds

    # Tonal features
    key = Column(Integer, nullable=True)  # 0-11 (C, C#, D, ..., B)
    mode = Column(Integer, nullable=True)  # 0 = minor, 1 = major

    # Energy and dynamics
    loudness = Column(Float, nullable=True)  # dB
    energy = Column(Float, nullable=True)  # 0.0 - 1.0

    # Mood/Emotion
    valence = Column(Float, nullable=True)  # 0.0 - 1.0 (negative to positive)

    # Spectral features
    spectral_centroid_mean = Column(Float, nullable=True)
    spectral_centroid_std = Column(Float, nullable=True)
    spectral_bandwidth_mean = Column(Float, nullable=True)
    spectral_bandwidth_std = Column(Float, nullable=True)
    spectral_rolloff_mean = Column(Float, nullable=True)
    spectral_rolloff_std = Column(Float, nullable=True)

    # Timbre (MFCCs - Mel-frequency cepstral coefficients)
    mfcc_mean = Column(JSON, nullable=True)  # Array of 20 MFCC means
    mfcc_std = Column(JSON, nullable=True)   # Array of 20 MFCC stds

    # Rhythm
    zero_crossing_rate_mean = Column(Float, nullable=True)
    zero_crossing_rate_std = Column(Float, nullable=True)

    # Harmony
    chroma_stft_mean = Column(JSON, nullable=True)  # 12 chroma features
    chroma_stft_std = Column(JSON, nullable=True)

    # ML cluster assignment
    cluster_id = Column(Integer, nullable=True, index=True)

    # Perceptual fingerprint (64-dim mel-spectrogram vector, JSON)
    perceptual_fingerprint = Column(JSON, nullable=True)

    # Provenance of the feature values.  ``librosa`` = extracted from an
    # uploaded audio file; ``spotify`` = copied from the Spotify Web API
    # audio-features endpoint (MFCC/chroma are synthesised as stubs for
    # vector-space compatibility).  Drives the hybrid recommender.
    feature_origin = Column(String(8), nullable=False, server_default="librosa")

    # Relationships
    music = relationship("Music", back_populates="audio_features")

    def __repr__(self):
        return f"<AudioFeatures(id={self.id}, music_id={self.music_id}, tempo={self.tempo}, energy={self.energy})>"
