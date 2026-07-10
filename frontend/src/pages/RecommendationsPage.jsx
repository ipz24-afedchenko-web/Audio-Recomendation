import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/AuthContext';
import { musicAPI, recommendAPI } from '../services/api';
import Reveal from '../components/Reveal';
import { usePlayer } from '../context/PlayerContext';

export default function RecommendationsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const { play } = usePlayer();

  const [tracks, setTracks] = useState([]);
  const [selected, setSelected] = useState(location.state?.musicId || '');
  const [algorithm, setAlgorithm] = useState(3);
  const [limit, setLimit] = useState(10);
  const [abTest, setAbTest] = useState(false);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [error, setError] = useState('');
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState('');
  const [abStats, setAbStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (user) {
      musicAPI.getUserMusic(user.id)
        .then((res) => setTracks(res.data))
        .catch(() => {})
        .finally(() => setLoadingTracks(false));
    }
  }, [user]);

  useEffect(() => {
    if (selected && !loadingTracks) getRecommendations();
    // eslint-disable-next-line
  }, [loadingTracks]);

  const getRecommendations = async () => {
    if (!selected) { setError(t('recommend.selectFirst')); return; }
    setError(''); setLoading(true); setRecs([]);
    try {
      const res = await recommendAPI.get(selected, limit, algorithm, abTest);
      setRecs(res.data);
      if (res.data.length === 0) setError(t('recommend.noRecsError'));
    } catch {
      setError(t('recommend.getRecsError'));
    } finally {
      setLoading(false);
    }
  };

  const handleClickRec = (rec) => {
    recommendAPI.recordEvent('click', rec.algorithm, rec.source_music_id, rec.recommended_music_id).catch(() => {});
  };

  const handleTrain = async () => {
    setTraining(true); setTrainResult('');
    try {
      const res = await recommendAPI.train(8);
      setTrainResult(`${t('admin.libraryTracks')}: ${res.data.total_tracks} · ${res.data.n_clusters} ${t('recommend.algorithm')} · ${res.data.inertia?.toFixed(1)}`);
    } catch {
      setTrainResult(t('recommend.trainingFailed'));
    } finally {
      setTraining(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await recommendAPI.getABStats();
      setAbStats(res.data);
    } catch { /* ignore */ } finally { setLoadingStats(false); }
  };

  const ALGOS = t('recommend.algorithms', { returnObjects: true });

  return (
    <div className="stack-lg">
      <Reveal className="page-head">
        <div className="page-head__eyebrow">✨ {t('recommend.title')}</div>
        <h1 className="page-head__title">{t('recommend.title')}</h1>
        <p className="page-head__sub">{t('recommend.subtitle')}</p>
      </Reveal>

      {/* Controls */}
      <Reveal className="panel">
        <div className="field">
          <label className="field__label" htmlFor="rec-source">{t('recommend.sourceTrack')}</label>
          {loadingTracks ? (
            <div className="text-sm text-muted">{t('recommend.loadingTracks')}</div>
          ) : (
            <select id="rec-source" className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">{t('recommend.selectTrack')}</option>
              {tracks.map((tr) => (
                <option key={tr.id} value={tr.id}>{tr.title}{tr.artist ? ` — ${tr.artist}` : ''}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-md flex-wrap" style={{ marginTop: 4 }}>
          <div>
            <div className="field__label">{t('recommend.algorithm')}</div>
            <div className="chip-row">
              {['3', '1', '2'].map((a) => (
                <button
                  key={a}
                  className={`algo-chip ${algorithm === Number(a) && !abTest ? 'is-active' : ''}`}
                  onClick={() => { setAbTest(false); setAlgorithm(Number(a)); }}
                  disabled={abTest}
                >
                  {ALGOS[a]}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field__label" htmlFor="rec-limit">{t('recommend.limit')}</label>
            <input id="rec-limit" className="input" type="number" min={1} max={50} style={{ width: 90 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </div>

          <button className="btn btn--primary btn--lg" style={{ alignSelf: 'flex-end' }} onClick={getRecommendations} disabled={loading || !selected}>
            {loading ? <><span className="spinner" /> {t('recommend.searching')}</> : `🎯 ${t('recommend.findSimilar')}`}
          </button>
        </div>

        <label className="flex items-center gap-sm" style={{ marginTop: 18, cursor: 'pointer' }}>
          <input type="checkbox" checked={abTest} onChange={(e) => setAbTest(e.target.checked)} />
          <span className="text-sm">{t('recommend.abTestMode')}</span>
          {abTest && <span className="text-xs text-muted">· {t('recommend.abRandomNote')}</span>}
        </label>
      </Reveal>

      <div className="flex items-center gap-sm">
        <button className="btn btn--ghost btn--sm" onClick={handleTrain} disabled={training}>
          {training ? <><span className="spinner" /> {t('recommend.training')}</> : `⚙️ ${t('recommend.trainModel')}`}
        </button>
        {trainResult && <span className="text-sm text-muted">{trainResult}</span>}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {/* Results */}
      {recs.length > 0 && (
        <Reveal>
          <div className="meta-line mb-md">
            <b>{t('recommend.recCount', { count: recs.length })}</b>
            <span>·</span>
            <span>{t('recommend.perAlgorithm', { name: ALGOS[recs[0]?.algorithm] || '' })}</span>
          </div>
          <div className="rec-list">
            {recs.map((rec, i) => (
              <Reveal key={rec.id || i} delay={Math.min(i, 6)} className="rec-item" onClick={() => handleClickRec(rec)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClickRec(rec); }}>
                <div className="rec-item__art" aria-hidden="true">🎵</div>
                <div className="rec-item__info">
                  <div className="flex items-center gap-sm">
                    <div className="rec-item__title">{rec.recommended_music?.title || t('recommend.track', { id: rec.recommended_music_id })}</div>
                    <button className="btn-icon" onClick={() => play(rec)} aria-label={t('player.play')}>▶</button>
                  </div>
                  <div className="rec-item__sub">
                    {rec.recommended_music?.artist}
                    {rec.recommended_music?.genre && <span className="tag">{rec.recommended_music.genre}</span>}
                    {rec.recommended_music?.source === 'spotify' && <span className="pill pill--success">Spotify</span>}
                  </div>
                  {rec.recommended_music?.source === 'spotify' && rec.recommended_music?.external_id && (
                    <iframe className="spotify-embed" src={`https://open.spotify.com/embed/track/${rec.recommended_music.external_id}?utm_source=generator`} height="80" title={t('analyze.previewLabel')} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
                  )}
                </div>
                <div className="ring" style={{ '--p': Math.round((rec.similarity_score || 0) * 100) }}>
                  {Math.round((rec.similarity_score || 0) * 100)}%
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      )}

      {!loading && recs.length === 0 && !error && (
        <Reveal className="empty">
          <div className="empty__icon">🎯</div>
          <div className="empty__title">{t('recommend.noRecsYet')}</div>
          <p className="empty__text">{t('recommend.recommendClickNote')}</p>
        </Reveal>
      )}

      {/* A/B stats */}
      <Reveal className="panel">
        <div className="flex items-center justify-between mb-md">
          <h3 style={{ margin: 0 }}>📊 {t('recommend.abResults')}</h3>
          <button className="btn btn--ghost btn--sm" onClick={loadStats} disabled={loadingStats}>
            {loadingStats ? t('recommend.loading') : t('recommend.refresh')}
          </button>
        </div>

        {abStats ? (
          <div>
            <p className="text-sm text-muted mb-md">{t('recommend.totalEvents', { count: abStats.total_events })}</p>
            {abStats.rows?.length === 0 ? (
              <p className="text-sm text-muted">{t('recommend.noData')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('admin.colAlgorithm')}</th>
                    <th>{t('admin.colImpressions')}</th>
                    <th>{t('admin.colClicks')}</th>
                    <th>{t('admin.colPlays')}</th>
                    <th>{t('admin.colCtr')}</th>
                  </tr>
                </thead>
                <tbody>
                  {abStats.rows.map((row) => (
                    <tr key={row.algorithm}>
                      <td><span className="tag">{ALGOS[row.algorithm] || t('recommend.track', { id: row.algorithm })}</span></td>
                      <td>{row.impressions}</td>
                      <td>{row.clicks}</td>
                      <td>{row.plays}</td>
                      <td className={row.ctr > 0 ? 'text-success' : ''}>{row.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          !loadingStats && <p className="text-sm text-muted">{t('recommend.clickRefresh')}</p>
        )}
      </Reveal>
    </div>
  );
}
