import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { musicAPI } from '../services/api';
import strings from '../strings';

export default function UploadPage() {
  const navigate = useNavigate();
  useTranslation();

  const [tab, setTab] = useState('local'); // 'local' | 'spotify'

  /* ── Shared ── */
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* ── Local upload ── */
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [analysisError, setAnalysisError] = useState(null);
  const [uploadedMusicId, setUploadedMusicId] = useState(null);

  /* ── Spotify ── */
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyAdding, setSpotifyAdding] = useState(null); // track id being added
  // The free Spotify Web API now requires a Premium owner account, so the
  // catalog tab is hidden unless the backend reports it as enabled.
  const [spotifyEnabled, setSpotifyEnabled] = useState(false);

  useEffect(() => {
    if (tab !== 'local') return;
    musicAPI.aiStatus()
      .then(res => setAiAvailable(res.data.available))
      .catch(() => setAiAvailable(false));
  }, [tab]);

  // Poll whether the Spotify catalog integration is usable.  The backend
  // probes the API (cached ~5 min) and returns false on 403/unavailable,
  // so this lets the tab appear automatically once Premium activates
  // (no page reload needed) and disappear if the service breaks.
  useEffect(() => {
    let active = true;
    const check = () =>
      musicAPI.spotifyStatus()
        .then(res => { if (active) setSpotifyEnabled(!!res.data.enabled); })
        .catch(() => { if (active) setSpotifyEnabled(false); });
    check();
    const id = setInterval(check, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  /* ── Local handlers ── */
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      if (!title) {
        const name = selected.name.replace(/\.[^/.]+$/, '');
        setTitle(name);
      }
    }
  };

  const handleAutoTag = async () => {
    if (!file) {
      setError(strings.upload.selectFileFirst);
      return;
    }
    setAiLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('filename', file.name);
      const res = await musicAPI.autoTag(formData);
      if (res.data.success && res.data.metadata) {
        const meta = res.data.metadata;
        setTitle(meta.title || title);
        setArtist(meta.artist || '');
        setAlbum(meta.album || '');
        setGenre(meta.genre || '');
        setSuccess(strings.upload.metaFilled);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || strings.upload.aiTaggingFailed;
      setError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setArtist('');
    setAlbum('');
    setGenre('');
    setError('');
    setSuccess('');
    setAnalysisStatus('idle');
    setAnalysisError(null);
    setUploadedMusicId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!file) {
      setError(strings.upload.selectAudio);
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      if (artist) formData.append('artist', artist);
      if (album) formData.append('album', album);
      if (genre) formData.append('genre', genre);

      const res = await musicAPI.upload(formData);
      const newId = res.data.id;
      setUploadedMusicId(newId);
      setAnalysisStatus(res.data.analysis_status || 'pending');
      setSuccess(`⬆ "${res.data.title}" ${strings.upload.uploaded}`);

      setFile(null);
      setTitle('');
      setArtist('');
      setAlbum('');
      setGenre('');

      setLoading(false);
      const final = await musicAPI.waitForAnalysis(newId, {
        onUpdate: (data) => setAnalysisStatus(data.analysis_status),
      });
      setAnalysisStatus(final.analysis_status);
      if (final.analysis_status === 'error') {
        setAnalysisError(final.analysis_error || strings.errorBoundary.unknownError);
        setError(strings.upload.analysisFailed.replace('{{detail}}', final.analysis_error || strings.errorBoundary.unknownError));
      } else {
        setSuccess(`✅ "${final.title}" ${strings.upload.fullyAnalyzed}`);
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        setError(`⚠️ ${err.response.data.detail}`);
      } else {
        setError(err.response?.data?.detail || strings.upload.analysisFailed.replace('{{detail}}', 'upload failed'));
      }
      setLoading(false);
    }
  };

  /* ── Spotify handlers ── */
  const handleSpotifySearch = async (e) => {
    e.preventDefault();
    setError('');
    if (!spotifyQuery.trim()) {
      setError(strings.upload.spotify.emptyQuery);
      return;
    }
    setSpotifyLoading(true);
    try {
      const res = await musicAPI.spotifySearch(spotifyQuery.trim());
      setSpotifyResults(res.data || []);
    } catch (err) {
      if (err.response?.status === 503 || err.response?.status === 502) {
        // 503 = not configured; 502 = live Spotify call failed (e.g. 403
        // once Premium lapses).  Either way the backend has marked the
        // service unhealthy, so hide the tab to avoid a broken flow.
        setSpotifyEnabled(false);
        setTab('local');
        setError(
          err.response?.status === 503
            ? strings.upload.spotify.disabled
            : strings.upload.spotify.searchFailed
        );
      } else {
        setError(strings.upload.spotify.searchFailed);
      }
      setSpotifyResults([]);
    } finally {
      setSpotifyLoading(false);
    }
  };

  const handleAddSpotify = async (track) => {
    setSpotifyAdding(track.spotify_track_id);
    setError('');
    try {
      await musicAPI.addSpotify(track.spotify_track_id);
      setSuccess(`✅ "${track.title}" ${strings.upload.spotify.added}`);
      // Remove from the results list so it can't be added twice.
      setSpotifyResults((prev) =>
        prev.filter((t) => t.spotify_track_id !== track.spotify_track_id)
      );
    } catch (err) {
      if (err.response?.status === 409) {
        setError(`⚠️ ${strings.upload.spotify.alreadyAdded}`);
        setSpotifyResults((prev) =>
          prev.filter((t) => t.spotify_track_id !== track.spotify_track_id)
        );
      } else {
        setError(strings.upload.spotify.addFailed);
      }
    } finally {
      setSpotifyAdding(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{strings.upload.title}</h1>
        <p className="page-subtitle">{strings.upload.subtitle}</p>
      </div>

      <div className="card card-narrow">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* Tab switcher */}
        <div className="tab-bar mb-md">
          <button
            type="button"
            className={`tab ${tab === 'local' ? 'tab-active' : ''}`}
            onClick={() => setTab('local')}
          >
            {strings.upload.tabLocal}
          </button>
          {spotifyEnabled && (
            <button
              type="button"
              className={`tab ${tab === 'spotify' ? 'tab-active' : ''}`}
              onClick={() => setTab('spotify')}
            >
              {strings.upload.tabSpotify}
            </button>
          )}
        </div>

        {tab === 'local' ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="upload-file">{strings.upload.audioFile}</label>
              <input
                id="upload-file"
                className="form-input"
                type="file"
                accept=".mp3,.wav,.flac,.ogg"
                onChange={handleFileChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="upload-title">
                {strings.upload.titleLabel}
                {aiAvailable === true && (
                  <span className="pill pill-success ml-sm">✦ {strings.upload.aiReady}</span>
                )}
                {aiAvailable === false && (
                  <span className="pill pill-muted ml-sm">{strings.upload.aiNotConfigured}</span>
                )}
              </label>
              <div className="flex gap-sm flex-start">
                <input
                  id="upload-title"
                  className="form-input flex-1"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={strings.upload.placeholderTitle}
                  required
                />
                <button
                  type="button"
                  className="btn btn-secondary text-nowrap"
                  onClick={handleAutoTag}
                  disabled={aiLoading || !file || aiAvailable === false}
                  title={
                    aiAvailable === false
                      ? strings.upload.aiServiceMissing
                      : strings.upload.aiTooltip
                  }
                >
                  {aiLoading ? <><div className="spinner" /> {strings.upload.autoFillLoading}</> : `✨ ${strings.upload.autoFill}`}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="upload-artist">{strings.upload.artistLabel}</label>
              <input
                id="upload-artist"
                className="form-input"
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder={strings.upload.placeholderArtist}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="upload-album">{strings.upload.albumLabel}</label>
              <input
                id="upload-album"
                className="form-input"
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder={strings.upload.placeholderAlbum}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="upload-genre">{strings.upload.genreLabel}</label>
              <input
                id="upload-genre"
                className="form-input"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder={strings.upload.placeholderGenre}
              />
            </div>

            <div className="flex gap-sm">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || analysisStatus === 'analyzing' || analysisStatus === 'pending'}
                id="upload-submit"
              >
                {loading
                  ? <><div className="spinner" /> {strings.upload.uploading}</>
                  : analysisStatus === 'analyzing' || analysisStatus === 'pending'
                    ? <><div className="spinner" /> {strings.upload.analyzing}</>
                    : `⬆ ${strings.upload.submit}`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { resetForm(); navigate('/'); }}
              >
                {strings.common.cancel}
              </button>
            </div>

            {analysisStatus === 'analyzing' && (
              <p className="text-sm text-muted mt-md">⏳ {strings.upload.extracting}</p>
            )}
            {analysisStatus === 'ready' && (
              <p className="text-sm mt-md text-accent">🎵 {strings.upload.complete}</p>
            )}
            {analysisStatus === 'error' && analysisError && (
              <p className="text-sm mt-md text-danger">
                ⚠️ {strings.upload.analysisFailed.replace('{{detail}}', analysisError)}
              </p>
            )}
          </form>
        ) : (
          <div className="spotify-tab">
            <p className="text-sm text-muted mb-md">{strings.upload.spotify.note}</p>
            <form onSubmit={handleSpotifySearch} className="flex gap-sm flex-start mb-md">
              <input
                className="form-input flex-1"
                type="text"
                value={spotifyQuery}
                onChange={(e) => setSpotifyQuery(e.target.value)}
                placeholder={strings.upload.spotify.searchPlaceholder}
              />
              <button
                type="submit"
                className="btn btn-primary text-nowrap"
                disabled={spotifyLoading}
              >
                {spotifyLoading
                  ? <><div className="spinner" /> {strings.upload.spotify.searching}</>
                  : strings.upload.spotify.searchButton}
              </button>
            </form>

            {spotifyResults.length === 0 && !spotifyLoading && (
              <p className="text-sm text-muted">{strings.upload.spotify.emptyQuery}</p>
            )}
            {!spotifyLoading && spotifyResults.length === 0 && spotifyQuery && (
              <p className="text-sm text-muted">{strings.upload.spotify.noResults}</p>
            )}

            <div className="spotify-results">
              {spotifyResults.map((track) => (
                <div className="track-row" key={track.spotify_track_id}>
                  {track.image_url && (
                    <img className="track-thumb" src={track.image_url} alt="" />
                  )}
                  <div className="track-meta flex-1">
                    <div className="track-title">{track.title}</div>
                    <div className="track-sub">
                      {track.artist}{track.album ? ` · ${track.album}` : ''}
                    </div>
                    {track.preview_url && (
                      <iframe
                        className="spotify-preview"
                        src={`https://open.spotify.com/embed/track/${track.spotify_track_id}?utm_source=generator`}
                        width="100%"
                        height="80"
                        frameBorder="0"
                        loading="lazy"
                        title={strings.upload.spotify.previewLabel}
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary text-nowrap"
                    disabled={spotifyAdding === track.spotify_track_id}
                    onClick={() => handleAddSpotify(track)}
                  >
                    {spotifyAdding === track.spotify_track_id
                      ? strings.upload.spotify.adding
                      : strings.upload.spotify.addButton}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
