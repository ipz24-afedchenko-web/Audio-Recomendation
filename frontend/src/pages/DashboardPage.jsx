import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/AuthContext';
import { musicAPI, analyzeAPI } from '../services/api';
import Reveal from '../components/Reveal';
import { usePlayer } from '../context/PlayerContext';

const STATUS_KEY = {
  pending: 'pending',
  analyzing: 'analyzing',
  ready: 'ready',
  error: 'error',
};

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return null;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = usePlayer();

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (user) loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadTracks = async () => {
    try {
      const res = await musicAPI.getUserMusic(user.id);
      setTracks(res.data);
    } catch {
      setError(t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (id) => {
    setBusyId(id);
    try {
      await analyzeAPI.analyze(id);
      navigate(`/analyze/${id}`);
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      if (detail.includes('already analyzed')) navigate(`/analyze/${id}`);
      else setError(t('dashboard.analysisFailed', { detail }));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('dashboard.deleteConfirm'))) return;
    try {
      await musicAPI.delete(id);
      setTracks((prev) => prev.filter((tr) => tr.id !== id));
    } catch {
      setError(t('dashboard.deleteError'));
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <span className="spinner spinner--lg" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  const analyzed = tracks.filter((tr) => tr.analysis_status === 'ready').length;
  const initial = (user?.username || '?').charAt(0).toUpperCase();

  return (
    <div className="stack-lg">
      {/* Hero strip */}
      <Reveal className="hero-strip">
        <div className="hero-strip__avatar" aria-hidden="true">{initial}</div>
        <div>
          <div className="hero-strip__name">{t('dashboard.greeting', { name: user?.username })}</div>
          <div className="hero-strip__sub">
            {t('dashboard.heroSub', { count: tracks.length, analyzed })}
          </div>
        </div>
        <div className="hero-strip__spacer" />
        <button className="btn btn--primary btn--lg" onClick={() => navigate('/upload')}>
          ⬆️ {t('dashboard.uploadBtn')}
        </button>
      </Reveal>

      {error && <div className="alert alert--error">{error}</div>}

      {/* Library */}
      {tracks.length === 0 ? (
        <Reveal className="empty">
          <div className="empty__icon">📂</div>
          <div className="empty__title">{t('dashboard.emptyTitle')}</div>
          <p className="empty__text">{t('dashboard.emptyText')}</p>
          <button className="btn btn--primary btn--lg" onClick={() => navigate('/upload')}>
            {t('dashboard.emptyBtn')}
          </button>
        </Reveal>
      ) : (
        <div className="library-grid">
          {tracks.map((track, i) => {
            const status = STATUS_KEY[track.analysis_status] || 'pending';
            const size = formatSize(track.file_size);
            const isSpotify = track.source === 'spotify';
            const ready = status === 'ready' || isSpotify;
            return (
              <Reveal key={track.id} delay={Math.min(i, 8)} className="track-card">
                <div className="track-card__art" aria-hidden="true">🎵</div>

                <div>
                  <div className="track-card__title">{track.title}</div>
                  <div className="track-card__meta">
                    {track.artist && <span>🎤 {track.artist}</span>}
                    {track.album && <span>💿 {track.album}</span>}
                    <span>⏱️ {formatDuration(track.duration)}</span>
                    {isSpotify
                      ? <span className="pill pill--success">Spotify</span>
                      : size && <span>📦 {size}</span>}
                  </div>
                </div>

                <div className="flex gap-xs flex-wrap" style={{ marginTop: -4 }}>
                  <span className={`status status--${status}`}>
                    <span className="status__dot" />
                    {t(`bulk.status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
                  </span>
                  {track.genre && <span className="tag">{track.genre}</span>}
                </div>

                <div className="track-card__actions">
                  <button className="btn-icon" onClick={() => play(track)} aria-label={t('player.play')}>▶</button>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => (ready ? navigate(`/analyze/${track.id}`) : handleAnalyze(track.id))}
                    disabled={busyId === track.id}
                  >
                    {busyId === track.id
                      ? <><span className="spinner" /> {t('dashboard.analyzing')}</>
                      : ready
                        ? '🔍 ' + t('common.open')
                        : '⚙️ ' + t('dashboard.analyze')}
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => handleDelete(track.id)}
                  >
                    🗑 {t('common.delete')}
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
