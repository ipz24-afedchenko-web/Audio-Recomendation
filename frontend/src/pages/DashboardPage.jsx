import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { musicAPI, analyzeAPI } from '../services/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzingId, setAnalyzingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadTracks();
  }, [user]);

  const loadTracks = async () => {
    if (!user) return;
    try {
      const res = await musicAPI.getUserMusic(user.id);
      setTracks(res.data);
    } catch (err) {
      setError('Failed to load tracks');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (musicId) => {
    setAnalyzingId(musicId);
    try {
      await analyzeAPI.analyze(musicId);
      navigate(`/analyze/${musicId}`);
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      if (detail.includes('already analyzed')) {
        navigate(`/analyze/${musicId}`);
      } else {
        setError(`Analysis failed: ${detail}`);
      }
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleDelete = async (musicId) => {
    if (!window.confirm('Delete this track?')) return;
    setDeletingId(musicId);
    try {
      await musicAPI.delete(musicId);
      setTracks((prev) => prev.filter((t) => t.id !== musicId));
    } catch (err) {
      setError('Failed to delete track');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading library…</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">My Library</h1>
          <p className="page-subtitle">{tracks.length} track{tracks.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/upload')} id="upload-btn">
          + Upload
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {tracks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎵</div>
          <p className="empty-state-text">No tracks yet. Upload your first audio file!</p>
          <button className="btn btn-primary" onClick={() => navigate('/upload')}>
            Upload Music
          </button>
        </div>
      ) : (
        <div className="music-grid">
          {tracks.map((track) => (
            <div key={track.id} className="card music-card" id={`track-${track.id}`}>
              <div className="music-title">{track.title}</div>
              <div className="music-meta">
                {track.artist && <span>Artist: {track.artist}</span>}
                {track.album && <span>Album: {track.album}</span>}
                <span>Duration: {formatDuration(track.duration)}</span>
                <span>Size: {formatSize(track.file_size)}</span>
                {track.genre && (
                  <span className="mt-sm">
                    <span className="tag">{track.genre}</span>
                  </span>
                )}
              </div>

              <div className="music-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAnalyze(track.id)}
                  disabled={analyzingId === track.id}
                  id={`analyze-btn-${track.id}`}
                >
                  {analyzingId === track.id ? (
                    <><div className="spinner" /> Analyzing…</>
                  ) : (
                    '🔍 Analyze'
                  )}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(track.id)}
                  disabled={deletingId === track.id}
                  id={`delete-btn-${track.id}`}
                >
                  {deletingId === track.id ? 'Deleting…' : '🗑 Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
