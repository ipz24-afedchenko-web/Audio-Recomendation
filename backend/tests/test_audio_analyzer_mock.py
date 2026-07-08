from unittest.mock import patch, MagicMock

import numpy as np
import pytest

from app.services.audio_analyzer import AudioAnalyzer


@pytest.fixture
def analyzer():
    return AudioAnalyzer(sr=22050, n_mfcc=20)


@pytest.fixture
def dummy_audio():
    sr = 22050
    t = np.linspace(0, 1.0, sr)
    y = 0.5 * np.sin(2 * np.pi * 440 * t)
    return y, sr


def test_analyze_calls_librosa_load(analyzer):
    with patch("app.services.audio_analyzer.librosa.load") as mock_load:
        mock_load.return_value = (np.zeros(22050), 22050)
        with patch.object(analyzer, "_extract_temporal_features") as m1:
            with patch.object(analyzer, "_extract_tonal_features") as m2:
                with patch.object(analyzer, "_extract_energy_features") as m3:
                    with patch.object(analyzer, "_extract_spectral_features") as m4:
                        with patch.object(analyzer, "_extract_timbre_features") as m5:
                            with patch.object(analyzer, "_extract_rhythm_features") as m6:
                                with patch.object(analyzer, "_extract_harmony_features") as m7:
                                    with patch("app.services.audio_analyzer.compute_perceptual_fingerprint") as mfp:
                                        m1.return_value = {"tempo": 120.0, "duration": 30.0}
                                        m2.return_value = {"key": 0, "mode": 1}
                                        m3.return_value = {"loudness": -10.0, "energy": 0.5}
                                        m4.return_value = {"spectral_centroid_mean": 2000.0}
                                        m5.return_value = {"mfcc_mean": [0.0]*20}
                                        m6.return_value = {"zero_crossing_rate_mean": 0.05}
                                        m7.return_value = {"chroma_stft_mean": [0.0]*12}
                                        mfp.return_value = [0.1]*64

                                        result = analyzer.analyze("/fake/path.wav")
                                        assert result["tempo"] == 120.0
                                        assert result["duration"] == 30.0
                                        assert result["key"] == 0
                                        assert result["loudness"] == -10.0
                                        assert result["energy"] == 0.5
                                        assert result["perceptual_fingerprint"] == [0.1]*64


def test_analyze_propagates_librosa_error(analyzer):
    with patch("app.services.audio_analyzer.librosa.load") as mock_load:
        mock_load.side_effect = RuntimeError("file not found")
        with pytest.raises(RuntimeError):
            analyzer.analyze("/bad/path.wav")


def test_temporal_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.beat.beat_track") as m_beat:
        with patch("app.services.audio_analyzer.librosa.get_duration") as m_dur:
            m_beat.return_value = (120.0, [1])
            m_dur.return_value = 30.0
            result = analyzer._extract_temporal_features(y, sr)
            assert result["tempo"] == 120.0
            assert result["duration"] == 30.0


def test_temporal_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.beat.beat_track") as m_beat:
        m_beat.side_effect = RuntimeError("no beat")
        result = analyzer._extract_temporal_features(y, sr)
        assert result["tempo"] is None


def test_tonal_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.chroma_cqt") as m_chroma:
        chroma = np.zeros((12, 10))
        chroma[5, :] = 1.0
        m_chroma.return_value = chroma
        result = analyzer._extract_tonal_features(y, sr)
        assert result["key"] == 5
        assert result["mode"] in (0, 1)


def test_tonal_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.chroma_cqt") as m_chroma:
        m_chroma.side_effect = RuntimeError("no chroma")
        result = analyzer._extract_tonal_features(y, sr)
        assert result["key"] is None


def test_energy_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.rms") as m_rms:
        rms = np.array([[0.1, 0.2, 0.3]])
        m_rms.return_value = rms
        with patch("app.services.audio_analyzer.librosa.amplitude_to_db") as m_db:
            m_db.return_value = -5.0
            result = analyzer._extract_energy_features(y, sr)
            assert result["loudness"] == -5.0
            assert result["energy"] >= 0.0


def test_energy_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.rms") as m_rms:
        m_rms.side_effect = RuntimeError("no rms")
        result = analyzer._extract_energy_features(y, sr)
        assert result["loudness"] is None


def test_spectral_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.spectral_centroid") as m_sc:
        with patch("app.services.audio_analyzer.librosa.feature.spectral_bandwidth") as m_sb:
            with patch("app.services.audio_analyzer.librosa.feature.spectral_rolloff") as m_sr:
                m_sc.return_value = np.array([[1000.0, 2000.0]])
                m_sb.return_value = np.array([[500.0, 600.0]])
                m_sr.return_value = np.array([[3000.0, 4000.0]])
                result = analyzer._extract_spectral_features(y, sr)
                assert result["spectral_centroid_mean"] == 1500.0
                assert result["spectral_bandwidth_mean"] == 550.0


def test_spectral_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.spectral_centroid") as m_sc:
        m_sc.side_effect = RuntimeError("no spectral")
        result = analyzer._extract_spectral_features(y, sr)
        assert result["spectral_centroid_mean"] is None


def test_timbre_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.mfcc") as m_mfcc:
        m_mfcc.return_value = np.random.randn(20, 50)
        result = analyzer._extract_timbre_features(y, sr)
        assert len(result["mfcc_mean"]) == 20


def test_timbre_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.mfcc") as m_mfcc:
        m_mfcc.side_effect = RuntimeError("no mfcc")
        result = analyzer._extract_timbre_features(y, sr)
        assert result["mfcc_mean"] is None


def test_rhythm_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.zero_crossing_rate") as m_zcr:
        m_zcr.return_value = np.array([[0.01, 0.02]])
        result = analyzer._extract_rhythm_features(y, sr)
        assert result["zero_crossing_rate_mean"] == 0.015


def test_rhythm_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.zero_crossing_rate") as m_zcr:
        m_zcr.side_effect = RuntimeError("no zcr")
        result = analyzer._extract_rhythm_features(y, sr)
        assert result["zero_crossing_rate_mean"] is None


def test_harmony_features(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.chroma_stft") as m_chroma:
        m_chroma.return_value = np.random.randn(12, 50)
        result = analyzer._extract_harmony_features(y, sr)
        assert len(result["chroma_stft_mean"]) == 12


def test_harmony_features_exception(analyzer, dummy_audio):
    y, sr = dummy_audio
    with patch("app.services.audio_analyzer.librosa.feature.chroma_stft") as m_chroma:
        m_chroma.side_effect = RuntimeError("no chroma stft")
        result = analyzer._extract_harmony_features(y, sr)
        assert result["chroma_stft_mean"] is None


def test_estimate_valence_all_features(analyzer):
    features = {
        "mode": 1,
        "tempo": 120.0,
        "energy": 0.7,
        "loudness": -20.0,
        "spectral_centroid_mean": 3000.0,
        "zero_crossing_rate_mean": 0.1,
    }
    v = analyzer.estimate_valence(features)
    assert v is not None
    assert 0.0 <= v <= 1.0


def test_estimate_valence_no_features(analyzer):
    assert analyzer.estimate_valence({}) is None


def test_estimate_valence_partial(analyzer):
    features = {"mode": 0, "energy": 0.2}
    v = analyzer.estimate_valence(features)
    assert v is not None
    assert 0.0 <= v <= 1.0


def test_estimate_valence_exception(analyzer):
    class BadDict(dict):
        def get(self, key, default=None):
            raise RuntimeError("oops")

    v = analyzer.estimate_valence(BadDict())
    assert v is None
