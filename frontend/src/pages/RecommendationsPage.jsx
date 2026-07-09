import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/AuthContext';
import { musicAPI, recommendAPI } from '../services/api';
import strings from '../strings';

export default function RecommendationsPage() {
  const { user } = useAuth();
  const location = useLocation();
  useTranslation();

  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(location.state?.musicId || '');
  const [algorithm, setAlgorithm] = useState(3);
  const [limit, setLimit] = useState(10);
  const [abTest, setAbTest] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [error, setError] = useState('');
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState('');
  const [abStats, setAbStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (user) {
      musicAPI
        .getUserMusic(user.id)
        .then((res) => setTracks(res.data))
        .catch(() => {})
        .finally(() => setLoadingTracks(false));
    }
  }, [user]);

  useEffect(() => {
    if (selectedTrack && !loadingTracks) {
      handleGetRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTracks]);

  const handleGetRecommendations = async () => {
    if (!selectedTrack) {
      setError(strings.recommend.selectFirst);
      return;
    }
    setError('');
    setLoading(true);
    setRecommendations([]);
    try {
      const res = await recommendAPI.get(selectedTrack, limit, algorithm, abTest);
      setRecommendations(res.data);
      if (res.data.length === 0) {
        setError(strings.recommend.noRecsError);
      }
    } catch (err) {
      setError(err.response?.data?.detail || strings.recommend.getRecsError);
    } finally {
      setLoading(false);
    }
  };

  const handleClickRec = async (rec) => {
    try {
      await recommendAPI.recordEvent('click', rec.algorithm, rec.source_music_id, rec.recommended_music_id);
    } catch {
    }
  };

  const handleTrain = async () => {
    setTraining(true);
    setTrainResult('');
    try {
      const res = await recommendAPI.train(8);
      setTrainResult(
        `Trained: ${res.data.total_tracks} tracks in ${res.data.n_clusters} clusters (inertia: ${res.data.inertia?.toFixed(1)})`
      );
    } catch (err) {
      setTrainResult(`${err.response?.data?.detail || strings.recommend.trainingFailed}`);
    } finally {
      setTraining(false);
    }
  };

  const handleLoadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await recommendAPI.getABStats();
      setAbStats(res.data);
    } catch {
    } finally {
      setLoadingStats(false);
    }
  };

  const ALGO_LABELS = strings.recommend.algorithms;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{strings.recommend.title}</h1>
        <p className="page-subtitle">{strings.recommend.subtitle}</p>
      </div>

      {/* Controls */}
      <div className="card mb-lg">
        <div className="flex gap-md flex-wrap flex-end">
          <div className="form-group mb-0 flex-1-200">
            <label className="form-label" htmlFor="rec-track">{strings.recommend.sourceTrack}</label>
            {loadingTracks ? (
              <div className="text-muted text-sm">{strings.recommend.loadingTracks}</div>
            ) : (
              <select
                id="rec-track"
                className="form-input"
                value={selectedTrack}
                onChange={(e) => setSelectedTrack(e.target.value)}
              >
                <option value="">{strings.recommend.selectTrack}</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}{t.artist ? ` — ${t.artist}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group mb-0 flex-0-160">
            <label className="form-label" htmlFor="rec-algo">{strings.recommend.algorithm}</label>
            <select
              id="rec-algo"
              className="form-input"
              value={algorithm}
              onChange={(e) => setAlgorithm(Number(e.target.value))}
              disabled={abTest}
            >
              <option value={3}>{strings.recommend.algorithms['3']}</option>
              <option value={1}>{strings.recommend.algorithms['1']}</option>
              <option value={2}>{strings.recommend.algorithms['2']}</option>
            </select>
          </div>

          <div className="form-group mb-0 flex-0-90">
            <label className="form-label" htmlFor="rec-limit">{strings.recommend.limit}</label>
            <input
              id="rec-limit"
              className="form-input"
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>

          <button
            className="btn btn-primary mb-0"
            onClick={handleGetRecommendations}
            disabled={loading || !selectedTrack}
            id="rec-submit"
          >
            {loading ? <><div className="spinner" /> {strings.recommend.searching}</> : strings.recommend.findSimilar}
          </button>
        </div>

        {/* A/B Test toggle */}
        <div className="flex-center gap-sm mt-sm">
          <label className="form-label mb-0 text-sm" htmlFor="rec-ab-toggle">{strings.recommend.abTestMode}</label>
          <input
            id="rec-ab-toggle"
            type="checkbox"
            className="form-checkbox"
            checked={abTest}
            onChange={(e) => setAbTest(e.target.checked)}
          />
          {abTest && (
            <span className="text-sm text-muted">
              {strings.recommend.abRandomNote}
            </span>
          )}
        </div>
      </div>

      {/* Train model */}
      <div className="flex-center gap-sm mb-lg">
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleTrain}
          disabled={training}
          id="train-btn"
        >
          {training ? <><div className="spinner" /> {strings.recommend.training}</> : strings.recommend.trainModel}
        </button>
        {trainResult && <span className="text-sm">{trainResult}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Results */}
      {recommendations.length > 0 && (
        <div className="rec-list">
          <div className="text-sm text-muted mb-md">
            {strings.recommend.recCount(recommendations.length)} ·
            {strings.recommend.algorithmLabel}: {ALGO_LABELS[recommendations[0]?.algorithm] || strings.recommend.track}
          </div>

          {recommendations.map((rec, idx) => (
            <div
              key={rec.id || idx}
              className="rec-item"
              id={`rec-${idx}`}
              onClick={() => handleClickRec(rec)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClickRec(rec); }}
              style={{ cursor: 'pointer' }}
            >
              <div className="rec-info">
                <div className="rec-title">
                  {rec.recommended_music?.title || strings.recommend.track(rec.recommended_music_id)}
                </div>
                <div className="rec-artist">
                  {rec.recommended_music?.artist || ''}
                  {rec.recommended_music?.genre && (
                    <span className="tag ml-sm">
                      {rec.recommended_music.genre}
                    </span>
                  )}
                  {rec.recommended_music?.source === 'spotify' && (
                    <span className="tag tag-spotify ml-sm">Spotify</span>
                  )}
                </div>
                {rec.recommended_music?.source === 'spotify' && rec.recommended_music?.external_id && (
                  <iframe
                    className="spotify-preview mt-sm"
                    src={`https://open.spotify.com/embed/track/${rec.recommended_music.external_id}?utm_source=generator`}
                    width="100%"
                    height="80"
                    frameBorder="0"
                    loading="lazy"
                    title={strings.analyze.previewLabel}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  />
                )}
              </div>
              <div className="rec-score">
                {(rec.similarity_score * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && recommendations.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">{strings.recommend.findSimilar}</div>
          <p className="empty-state-text">
            {strings.recommend.recommendClickNote}
          </p>
        </div>
      )}

      {/* A/B Stats */}
      <div className="card mt-lg">
        <div className="flex-center gap-sm mb-sm">
          <h3 className="mb-0">{strings.recommend.abResults}</h3>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleLoadStats}
            disabled={loadingStats}
          >
            {loadingStats ? strings.recommend.loading : strings.recommend.refresh}
          </button>
        </div>

        {abStats && (
          <div>
            <p className="text-sm text-muted mb-md">
              {strings.recommend.totalEvents(abStats.total_events)}
            </p>
            {abStats.rows.length === 0 ? (
              <p className="text-sm text-muted">{strings.recommend.noData}</p>
            ) : (
              <div className="ab-stats-grid">
                <div className="ab-stats-header">
                  <span>{strings.recommend.algorithmLabel}</span>
                  <span>{strings.admin.abColumns.impressions}</span>
                  <span>{strings.admin.abColumns.clicks}</span>
                  <span>{strings.admin.abColumns.plays}</span>
                  <span>{strings.admin.abColumns.ctr}</span>
                </div>
                {abStats.rows.map((row) => (
                  <div key={row.algorithm} className="ab-stats-row">
                    <span className="tag">{ALGO_LABELS[row.algorithm] || strings.recommend.track(row.algorithm)}</span>
                    <span>{row.impressions}</span>
                    <span>{row.clicks}</span>
                    <span>{row.plays}</span>
                    <span className={row.ctr > 0 ? 'text-success' : ''}>
                      {row.ctr}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!abStats && !loadingStats && (
          <p className="text-sm text-muted">{strings.recommend.clickRefresh}</p>
        )}
      </div>
    </>
  );
}
