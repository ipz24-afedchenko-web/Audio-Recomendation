import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Plot from 'react-plotly.js';
import { analyzeAPI, musicAPI } from '../services/api';
import { useChartTheme } from '../utils/useChartTheme';
import Reveal from '../components/Reveal';
import { usePlayer } from '../context/PlayerContext';

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AnalyzePage() {
  const { musicId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const chart = useChartTheme();
  const { play, isSpotifyConnected } = usePlayer();

  const [track, setTrack] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [musicId]);

  const loadData = async () => {
    try {
      const [trackRes, featuresRes] = await Promise.all([
        musicAPI.getById(musicId),
        analyzeAPI.getFeatures(musicId),
      ]);
      setTrack(trackRes.data);
      setFeatures(featuresRes.data);
    } catch {
      setError(t('analyze.loadError'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <span className="spinner spinner--lg" />
        <span>{t('analyze.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="alert alert--error">{error}</div>
        <button className="btn btn--ghost" onClick={() => navigate('/')}>← {t('analyze.back')}</button>
      </div>
    );
  }

  const f = features || {};
  const accentBar = hexToRgba(chart.accent, 0.72);
  const dangerBar = hexToRgba(chart.danger, 0.55);

  const plotLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: chart.text, family: chart.font, size: 12 },
    margin: { t: 24, r: 16, b: 36, l: 44 },
    height: 300,
    showlegend: false,
  };

  const radarData = features
    ? [{
        type: 'scatterpolar',
        r: [
          f.energy ?? 0,
          f.valence ?? 0,
          f.tempo ? Math.min(f.tempo / 200, 1) : 0,
          f.loudness ? Math.min(Math.max((f.loudness + 20) / 18, 0), 1) : 0,
          f.spectral_centroid_mean ? Math.min(f.spectral_centroid_mean / 6000, 1) : 0,
          f.zero_crossing_rate_mean ? Math.min(f.zero_crossing_rate_mean * 5, 1) : 0,
        ],
        theta: [t('analyze.energy'), t('analyze.valence'), t('analyze.tempo'), t('analyze.loudness'), t('analyze.brightness'), t('analyze.zcr')],
        fill: 'toself',
        fillcolor: chart.accentSoft,
        line: { color: chart.accent, width: 2 },
        marker: { color: chart.accent, size: 5 },
      }]
    : [];

  const mfccData = f.mfcc_mean
    ? [{ type: 'bar', x: f.mfcc_mean.map((_, i) => `MFCC ${i + 1}`), y: f.mfcc_mean, marker: { color: f.mfcc_mean.map((v) => (v >= 0 ? accentBar : dangerBar)) } }]
    : [];

  const chromaData = f.chroma_stft_mean
    ? [{ type: 'bar', x: KEY_NAMES, y: f.chroma_stft_mean, marker: { color: accentBar } }]
    : [];

  const stats = [
    { label: t('analyze.tempo'), value: f.tempo ? Math.round(f.tempo) : '—', unit: 'BPM' },
    { label: t('analyze.key'), value: f.key != null ? KEY_NAMES[f.key] : '—', unit: f.mode === 1 ? t('analyze.major') : f.mode === 0 ? t('analyze.minor') : '' },
    { label: t('analyze.loudness'), value: f.loudness != null ? f.loudness.toFixed(1) : '—', unit: 'dB' },
    { label: t('analyze.energy'), value: f.energy != null ? (f.energy * 100).toFixed(0) : '—', unit: '%' },
    { label: t('analyze.valence'), value: f.valence != null ? (f.valence * 100).toFixed(0) : '—', unit: '%' },
    { label: t('analyze.duration'), value: formatDuration(f.duration), unit: '' },
  ];

  return (
    <div className="stack-lg">
      <Reveal>
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/')}>← {t('analyze.back')}</button>
      </Reveal>

      <Reveal className="page-head">
        <div className="page-head__eyebrow">🎵 {t('analyze.trackAnalysis')}</div>
        <h1 className="page-head__title">{track?.title || t('analyze.trackAnalysis')}</h1>
        {track?.artist && <p className="page-head__sub">{track.artist}</p>}
        {track?.genre && <span className="tag mt-sm">{track.genre}</span>}
      </Reveal>

      {track?.source === 'spotify' && !isSpotifyConnected && (
        <Reveal>
          <a className="btn btn--spotify btn--lg" href="/api/spotify/auth/login" onClick={async (e) => {
            e.preventDefault();
            const r = await musicAPI.spotifyAuth.login();
            window.location.href = r.data.url;
          }}>
            Connect Spotify to Play
          </a>
        </Reveal>
      )}

      {track && (
        <Reveal>
          <button className="btn btn--primary btn--lg" onClick={() => play(track)}>
            ▶ {track.source === 'spotify' ? t('analyze.playSpotify') : t('analyze.playLocal')}
          </button>
        </Reveal>
      )}

      {/* Feature stats */}
      <div className="grid grid--3">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i} className="stat">
            <div className="stat__label">{s.label}</div>
            <div className="stat__value">
              {s.value}{s.unit && <span className="stat__unit">{s.unit}</span>}
            </div>
          </Reveal>
        ))}
      </div>

      {/* Charts */}
      <Reveal className="chart-card">
        <div className="chart-card__title"><span className="dot" /> {t('analyze.audioProfile')}</div>
        <Plot
          data={radarData}
          layout={{ ...plotLayout, polar: { bgcolor: 'transparent', radialaxis: { visible: true, range: [0, 1], color: chart.borderLight, tickfont: { size: 10, color: chart.textMuted }, gridcolor: chart.border }, angularaxis: { color: chart.textMuted } } }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </Reveal>

      {mfccData.length > 0 && (
        <Reveal className="chart-card">
          <div className="chart-card__title"><span className="dot" /> {t('analyze.mfcc')}</div>
          <Plot
            data={mfccData}
            layout={{ ...plotLayout, xaxis: { color: chart.text, tickangle: -45, gridcolor: 'transparent' }, yaxis: { color: chart.text, gridcolor: chart.border } }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </Reveal>
      )}

      {chromaData.length > 0 && (
        <Reveal className="chart-card">
          <div className="chart-card__title"><span className="dot" /> {t('analyze.chromagram')}</div>
          <Plot
            data={chromaData}
            layout={{ ...plotLayout, xaxis: { color: chart.text, gridcolor: 'transparent' }, yaxis: { color: chart.text, gridcolor: chart.border } }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </Reveal>
      )}

      <Reveal className="text-center mt-lg">
        <button className="btn btn--primary btn--lg" onClick={() => navigate('/recommendations', { state: { musicId: parseInt(musicId, 10) } })}>
          ✨ {t('analyze.getRecs')}
        </button>
      </Reveal>
    </div>
  );
}
