import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { musicAPI, recommendAPI } from '../services/api';

export default function RecommendationsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(location.state?.musicId || '');
  const [algorithm, setAlgorithm] = useState(3);
  const [limit, setLimit] = useState(10);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [error, setError] = useState('');
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState('');

  useEffect(() => {
    if (user) {
      musicAPI
        .getUserMusic(user.id)
        .then((res) => setTracks(res.data))
        .catch(() => {})
        .finally(() => setLoadingTracks(false));
    }
  }, [user]);

  // Auto-fetch if musicId was passed via location state
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
      const res = await recommendAPI.get(selectedTrack, limit, algorithm);
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

  const handleTrain = async () => {
    setTraining(true);
    setTrainResult('');
    try {
      const res = await recommendAPI.train(8);
      setTrainResult(
        `✅ Trained: ${res.data.total_tracks} tracks in ${res.data.n_clusters} clusters (inertia: ${res.data.inertia?.toFixed(1)})`
      );
    } catch (err) {
      setTrainResult(`❌ ${err.response?.data?.detail || 'Training failed'}`);
    } finally {
      setTraining(false);
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
        <div className="flex gap-md" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
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

          <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 0 }}>
            <label className="form-label" htmlFor="rec-algo">Algorithm</label>
            <select
              id="rec-algo"
              className="form-input"
              value={algorithm}
              onChange={(e) => setAlgorithm(Number(e.target.value))}
            >
              <option value={3}>Cluster-Aware</option>
              <option value={1}>Cosine</option>
              <option value={2}>Euclidean</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: '0 0 90px', marginBottom: 0 }}>
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
            className="btn btn-primary"
            onClick={handleGetRecommendations}
            disabled={loading || !selectedTrack}
            id="rec-submit"
            style={{ marginBottom: 0 }}
          >
            {loading ? <><div className="spinner" /> Searching…</> : '🎯 Find Similar'}
          </button>
        </div>
      </div>

      {/* Train model */}
      <div className="flex gap-sm mb-lg" style={{ alignItems: 'center' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleTrain}
          disabled={training}
          id="train-btn"
        >
          {training ? <><div className="spinner" /> Training…</> : '⚙ Train Model'}
        </button>
        {trainResult && <span className="text-sm">{trainResult}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Results */}
      {recommendations.length > 0 && (
        <div className="rec-list">
          <div className="text-sm text-muted mb-md">
            {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''} ·{' '}
            Algorithm: {ALGO_LABELS[recommendations[0]?.algorithm] || 'Unknown'}
          </div>

          {recommendations.map((rec, idx) => (
            <div key={rec.id || idx} className="rec-item" id={`rec-${idx}`}>
              <div className="rec-info">
                <div className="rec-title">
                  {rec.recommended_music?.title || `Track #${rec.recommended_music_id}`}
                </div>
                <div className="rec-artist">
                  {rec.recommended_music?.artist || '—'}
                  {rec.recommended_music?.genre && (
                    <span className="tag" style={{ marginLeft: 8 }}>
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
          <div className="empty-state-icon">🎯</div>
          <p className="empty-state-text">
            Select a track and click "Find Similar" to get recommendations
          </p>
        </div>
      )}
    </>
  );
}
