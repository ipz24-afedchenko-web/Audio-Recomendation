import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Plot from 'react-plotly.js';
import { analyzeAPI, musicAPI } from '../services/api';
import strings from '../strings';

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function AnalyzePage() {
  const { musicId } = useParams();
  const navigate = useNavigate();
  useTranslation();

  const [track, setTrack] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [musicId]);

  const loadData = async () => {
    try {
      const [trackRes, featuresRes] = await Promise.all([
        musicAPI.getById(musicId),
        analyzeAPI.getFeatures(musicId),
      ]);
      setTrack(trackRes.data);
      setFeatures(featuresRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || strings.analyze.loadError);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>{strings.analyze.loading}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          ← {strings.analyze.backToLibrary}
        </button>
      </div>
    );
  }

  const formatDuration = (sec) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Plotly layout defaults for dark theme
  const plotLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#9090a0', family: 'Inter, sans-serif', size: 12 },
    margin: { t: 30, r: 20, b: 40, l: 50 },
    height: 300,
  };

  // Radar chart data
  const radarData = features
    ? [
        {
          type: 'scatterpolar',
          r: [
            features.energy ?? 0,
            features.valence ?? 0,
            features.tempo ? Math.min(features.tempo / 200, 1) : 0,
            features.loudness ? Math.min(Math.max((features.loudness + 20) / 18, 0), 1) : 0,
            features.spectral_centroid_mean ? Math.min(features.spectral_centroid_mean / 6000, 1) : 0,
            features.zero_crossing_rate_mean ? Math.min(features.zero_crossing_rate_mean * 5, 1) : 0,
          ],
          theta: [
            strings.analyze.energy,
            strings.analyze.valence,
            strings.analyze.tempo,
            strings.analyze.loudness,
            strings.analyze.brightness,
            strings.analyze.zcr,
          ],
          fill: 'toself',
          fillcolor: 'rgba(108, 92, 231, 0.15)',
          line: { color: '#6c5ce7', width: 2 },
          marker: { color: '#6c5ce7', size: 5 },
        },
      ]
    : [];

  // MFCC bar chart
  const mfccData =
    features?.mfcc_mean
      ? [
          {
            type: 'bar',
            x: features.mfcc_mean.map((_, i) => `MFCC ${i + 1}`),
            y: features.mfcc_mean,
            marker: {
              color: features.mfcc_mean.map(
                (v) => (v >= 0 ? 'rgba(108, 92, 231, 0.7)' : 'rgba(231, 76, 60, 0.5)')
              ),
            },
          },
        ]
      : [];

  // Chroma chart
  const chromaData =
    features?.chroma_stft_mean
      ? [
          {
            type: 'bar',
            x: KEY_NAMES,
            y: features.chroma_stft_mean,
            marker: { color: 'rgba(108, 92, 231, 0.6)' },
          },
        ]
      : [];

  return (
    <>
      <div className="page-header">
        <button className="btn btn-secondary btn-sm mb-md" onClick={() => navigate('/')}>
          ← {strings.common.back}
        </button>
        <h1 className="page-title">{track?.title || strings.analyze.trackAnalysis}</h1>
        {track?.artist && <p className="page-subtitle">{track.artist}</p>}
        {track?.source === 'spotify' && track?.external_id && (
          <div className="spotify-preview-wrap mb-md">
            <iframe
              className="spotify-preview"
              src={`https://open.spotify.com/embed/track/${track.external_id}?utm_source=generator`}
              width="100%"
              height="80"
              frameBorder="0"
              loading="lazy"
              title={strings.analyze.previewLabel}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            />
            <p className="text-xs text-muted mt-xs">{strings.analyze.previewNote}</p>
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="features-grid mb-lg">
        <div className="feature-item">
          <div className="feature-label">{strings.analyze.tempo}</div>
          <div className="feature-value">
            {features?.tempo ? Math.round(features.tempo) : '—'}
            <span className="feature-unit">BPM</span>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-label">{strings.analyze.key}</div>
          <div className="feature-value">
            {features?.key != null ? KEY_NAMES[features.key] : '—'}
            <span className="feature-unit">
              {features?.mode === 1 ? strings.analyze.major : features?.mode === 0 ? strings.analyze.minor : ''}
            </span>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-label">{strings.analyze.duration}</div>
          <div className="feature-value">{formatDuration(features?.duration)}</div>
        </div>
        <div className="feature-item">
          <div className="feature-label">{strings.analyze.loudness}</div>
          <div className="feature-value">
            {features?.loudness != null ? features.loudness.toFixed(1) : '—'}
            <span className="feature-unit">dB</span>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-label">{strings.analyze.energy}</div>
          <div className="feature-value">
            {features?.energy != null ? (features.energy * 100).toFixed(0) : '—'}
            <span className="feature-unit">%</span>
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-label">{strings.analyze.valence}</div>
          <div className="feature-value">
            {features?.valence != null ? (features.valence * 100).toFixed(0) : '—'}
            <span className="feature-unit">%</span>
          </div>
        </div>
      </div>

      {/* Radar chart */}
      <div className="chart-container">
        <div className="chart-title">{strings.analyze.audioProfile}</div>
        <Plot
          data={radarData}
          layout={{
            ...plotLayout,
            polar: {
              bgcolor: 'transparent',
              radialaxis: { visible: true, range: [0, 1], color: '#35354a', tickfont: { size: 10 } },
              angularaxis: { color: '#606070' },
            },
          }}
          config={{ displayModeBar: false, responsive: true }}
          className="w-full"
        />
      </div>

      {/* MFCCs */}
      {mfccData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">{strings.analyze.mfcc}</div>
          <Plot
            data={mfccData}
            layout={{
              ...plotLayout,
              xaxis: { color: '#606070', tickangle: -45 },
              yaxis: { color: '#606070', gridcolor: '#1a1a25' },
            }}
            config={{ displayModeBar: false, responsive: true }}
            className="w-full"
          />
        </div>
      )}

      {/* Chroma */}
      {chromaData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">{strings.analyze.chromagram}</div>
          <Plot
            data={chromaData}
            layout={{
              ...plotLayout,
              xaxis: { color: '#606070' },
              yaxis: { color: '#606070', gridcolor: '#1a1a25' },
            }}
            config={{ displayModeBar: false, responsive: true }}
            className="w-full"
          />
        </div>
      )}

      {/* Navigate to recommendations */}
      <div className="mt-lg">
        <button
          className="btn btn-primary"
          onClick={() => navigate('/recommendations', { state: { musicId: parseInt(musicId) } })}
          id="get-recommendations-btn"
        >
          🎯 {strings.analyze.getRecs}
        </button>
      </div>
    </>
  );
}
