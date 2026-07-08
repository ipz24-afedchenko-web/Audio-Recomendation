import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { musicAPI, recommendAPI } from '../services/api';

export default function RecommendationsPage() {
  const { user } = useAuth();
  const location = useLocation();

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
  }, [loadingTracks]);

  const handleGetRecommendations = async () => {
    if (!selectedTrack) {
      setError('Select a track first');
      return;
    }
    setError('');
    setLoading(true);
    setRecommendations([]);
    try {
      const res = await recommendAPI.get(selectedTrack, limit, algorithm, abTest);
      setRecommendations(res.data);
      if (res.data.length === 0) {
        setError('No recommendations found. Make sure other tracks are analyzed and the model is trained.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to get recommendations');
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
      setTrainResult(`${err.response?.data?.detail || 'Training failed'}`);
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

  const ALGO_LABELS = { 1: 'Cosine', 2: 'Euclidean', 3: 'Cluster-Aware' };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Recommendations</h1>
        <p className="page-subtitle">Find similar tracks based on audio features</p>
      </div>

      {/* Controls */}
      <div className="card mb-lg">
        <div className="flex gap-md flex-wrap flex-end">
          <div className="form-group mb-0 flex-1-200">
            <label className="form-label" htmlFor="rec-track">Source Track</label>
            {loadingTracks ? (
              <div className="text-muted text-sm">Loading tracks…</div>
            ) : (
              <select
                id="rec-track"
                className="form-input"
                value={selectedTrack}
                onChange={(e) => setSelectedTrack(e.target.value)}
              >
                <option value="">Select a track…</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}{t.artist ? ` — ${t.artist}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group mb-0 flex-0-160">
            <label className="form-label" htmlFor="rec-algo">Algorithm</label>
            <select
              id="rec-algo"
              className="form-input"
              value={algorithm}
              onChange={(e) => setAlgorithm(Number(e.target.value))}
              disabled={abTest}
            >
              <option value={3}>Cluster-Aware</option>
              <option value={1}>Cosine</option>
              <option value={2}>Euclidean</option>
            </select>
          </div>

          <div className="form-group mb-0 flex-0-90">
            <label className="form-label" htmlFor="rec-limit">Limit</label>
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
            {loading ? <><div className="spinner" /> Searching…</> : 'Find Similar'}
          </button>
        </div>

        {/* A/B Test toggle */}
        <div className="flex-center gap-sm mt-sm">
          <label className="form-label mb-0 text-sm" htmlFor="rec-ab-toggle">A/B Test Mode</label>
          <input
            id="rec-ab-toggle"
            type="checkbox"
            className="form-checkbox"
            checked={abTest}
            onChange={(e) => setAbTest(e.target.checked)}
          />
          {abTest && (
            <span className="text-sm text-muted">
              Random algorithm assigned per request
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
          {training ? <><div className="spinner" /> Training…</> : 'Train Model'}
        </button>
        {trainResult && <span className="text-sm">{trainResult}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Results */}
      {recommendations.length > 0 && (
        <div className="rec-list">
          <div className="text-sm text-muted mb-md">
            {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''} ·
            Algorithm: {ALGO_LABELS[recommendations[0]?.algorithm] || 'Unknown'}
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
                  {rec.recommended_music?.title || `Track #${rec.recommended_music_id}`}
                </div>
                <div className="rec-artist">
                  {rec.recommended_music?.artist || ''}
                  {rec.recommended_music?.genre && (
                    <span className="tag ml-sm">
                      {rec.recommended_music.genre}
                    </span>
                  )}
                </div>
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
          <div className="empty-state-icon">Find Similar</div>
          <p className="empty-state-text">
            Select a track and click "Find Similar" to get recommendations
          </p>
        </div>
      )}

      {/* A/B Stats */}
      <div className="card mt-lg">
        <div className="flex-center gap-sm mb-sm">
          <h3 className="mb-0">A/B Test Results</h3>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleLoadStats}
            disabled={loadingStats}
          >
            {loadingStats ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {abStats && (
          <div>
            <p className="text-sm text-muted mb-md">
              Total events recorded: {abStats.total_events}
            </p>
            {abStats.rows.length === 0 ? (
              <p className="text-sm text-muted">No data yet</p>
            ) : (
              <div className="ab-stats-grid">
                <div className="ab-stats-header">
                  <span>Algorithm</span>
                  <span>Impressions</span>
                  <span>Clicks</span>
                  <span>Plays</span>
                  <span>CTR</span>
                </div>
                {abStats.rows.map((row) => (
                  <div key={row.algorithm} className="ab-stats-row">
                    <span className="tag">{ALGO_LABELS[row.algorithm] || `Algo #${row.algorithm}`}</span>
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
          <p className="text-sm text-muted">Click Refresh to load A/B test data</p>
        )}
      </div>
    </>
  );
}
