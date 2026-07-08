import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/AuthContext';
import { adminAPI, recommendAPI } from '../services/api';
import { useTranslation } from 'react-i18next';
import strings from '../strings';

  const ALGO_LABELS = strings.recommend.algorithms;

export default function AdminDashboardPage() {
  const { user } = useAuth();
  useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    adminAPI
      .getStats()
      .then((res) => setStats(res.data))
      .catch((err) => {
        if (err.response?.status === 403) {
          setError(strings.admin.forbidden);
        } else {
          setError('Failed to load admin stats');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.is_superuser) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handlePromote = async () => {
    if (!stats?.ab?.best_algorithm) return;
    setPromoting(true);
    setMessage('');
    try {
      await recommendAPI.promote(stats.ab.best_algorithm);
      setMessage(strings.admin.ab.promoted);
      load();
    } catch {
      setMessage('Promotion failed');
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return <div className="card mt-lg">{strings.admin.loading}</div>;
  }

  if (!user?.is_superuser) {
    return <div className="card mt-lg">{strings.admin.forbidden}</div>;
  }

  if (error) {
    return <div className="card mt-lg text-danger">{error}</div>;
  }

  const ab = stats.ab || {};
  const rows = ab.rows || [];

  return (
    <>
      <div className="flex-between align-center mb-md">
        <div>
          <h2 className="mb-0">{strings.admin.pageTitle}</h2>
          <p className="text-muted mb-0">{strings.admin.pageSubtitle}</p>
        </div>
      </div>

      {/* Library overview */}
      <div className="card-grid-3 mb-lg">
        <div className="card">
          <div className="stat-label">{strings.admin.library.users}</div>
          <div className="stat-value">{stats.user_count}</div>
        </div>
        <div className="card">
          <div className="stat-label">{strings.admin.library.tracks}</div>
          <div className="stat-value">{stats.music_count}</div>
        </div>
        <div className="card">
          <div className="stat-label">{strings.admin.library.analyzed}</div>
          <div className="stat-value">{stats.analyzed_count}</div>
        </div>
      </div>

      {/* A/B results */}
      <div className="card">
        <div className="flex-between align-center mb-sm">
          <h3 className="mb-0">{strings.admin.ab.title}</h3>
          {ab.best_algorithm != null && (
            <span className={`pill ${ab.winner_significant ? 'pill-success' : 'pill-muted'}`}>
              {strings.admin.ab.best}: {ALGO_LABELS[ab.best_algorithm] || `#${ab.best_algorithm}`}
              {' · '}
              {ab.winner_significant
                ? strings.admin.ab.significant
                : strings.admin.ab.notSignificant}
              {ab.p_value != null && ab.p_value !== 0 && (
                <> {' · '}{strings.admin.ab.pValue}: {ab.p_value}</>
              )}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted">{strings.admin.ab.noData}</p>
        ) : (
          <div className="ab-stats-grid">
            <div className="ab-stats-header">
              <span>{strings.admin.abColumns.algorithm}</span>
              <span>{strings.admin.abColumns.impressions}</span>
              <span>{strings.admin.abColumns.clicks}</span>
              <span>{strings.admin.abColumns.plays}</span>
              <span>{strings.admin.abColumns.ctr}</span>
              <span>{strings.admin.ab.zScore}</span>
              <span>{strings.admin.ab.pValue}</span>
            </div>
            {rows.map((row) => (
              <div key={row.algorithm} className="ab-stats-row">
                <span className="tag">
                  {ALGO_LABELS[row.algorithm] || strings.recommend.track(row.algorithm)}
                  {ab.default_algorithm === row.algorithm && (
                    <span className="tag-default"> ({strings.admin.ab.defaultLabel})</span>
                  )}
                </span>
                <span>{row.impressions}</span>
                <span>{row.clicks}</span>
                <span>{row.plays}</span>
                <span className={row.ctr > 0 ? 'text-success' : ''}>{row.ctr}%</span>
                <span>{row.z_score != null ? row.z_score : '—'}</span>
                <span>
                  {row.p_value != null ? row.p_value : '—'}
                  {row.significant && <span className="text-success"> ✓</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {message && <p className="text-sm text-success mt-sm">{message}</p>}

        {ab.best_algorithm != null && ab.default_algorithm !== ab.best_algorithm && (
          <button
            className="btn btn-primary mt-md"
            onClick={handlePromote}
            disabled={promoting}
          >
            {promoting ? 'Promoting…' : strings.admin.ab.promote}
          </button>
        )}
      </div>
    </>
  );
}
