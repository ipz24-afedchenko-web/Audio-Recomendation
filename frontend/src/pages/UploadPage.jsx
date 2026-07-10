import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { musicAPI } from '../services/api';
import Reveal from '../components/Reveal';
import { usePlayer } from '../context/PlayerContext';

const STAGES = ['upload', 'analyze', 'ready'];

export default function UploadPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = usePlayer();

  const [tab, setTab] = useState('file');

  /* ----- shared ----- */
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadedTrack, setUploadedTrack] = useState(null);

  /* ----- local upload ----- */
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | uploading | analyzing | ready | error
  const [analysisError, setAnalysisError] = useState(null);
  const [isDrag, setIsDrag] = useState(false);
  const fileInputRef = useRef(null);

  /* ----- spotify ----- */
  const [spotifyOn, setSpotifyOn] = useState(false);
  const [query, setQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [spotifyMsg, setSpotifyMsg] = useState('');

  useEffect(() => {
    musicAPI
      .spotifyStatus()
      .then((r) => setSpotifyOn(!!r.data.enabled))
      .catch(() => setSpotifyOn(false));
    musicAPI
      .aiStatus()
      .then((r) => setAiAvailable(r.data.available))
      .catch(() => setAiAvailable(false));
  }, []);

  /* ----- file selection ----- */
  const applyFile = useCallback((selected) => {
    if (!selected) return;
    setFile(selected);
    setError('');
    if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ''));
  }, [title]);

  const onFileChange = (e) => applyFile(e.target.files[0]);
  const onDrop = (e) => { e.preventDefault(); setIsDrag(false); applyFile(e.dataTransfer?.files?.[0]); };
  const openPicker = () => fileInputRef.current?.click();
  const clearFile = () => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  /* ----- AI auto-fill ----- */
  const handleAutoTag = async () => {
    if (!file) { setError(t('upload.selectFileFirst')); return; }
    setAiLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('filename', file.name);
      const res = await musicAPI.autoTag(fd);
      if (res.data.success && res.data.metadata) {
        const m = res.data.metadata;
        setTitle(m.title || title);
        setArtist(m.artist || '');
        setAlbum(m.album || '');
        setGenre(m.genre || '');
        setSuccess(t('upload.metaFilled'));
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch {
      setError(t('upload.aiTaggingFailed'));
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle(''); setArtist(''); setAlbum(''); setGenre('');
    setError(''); setSuccess('');
    setStage('idle'); setAnalysisError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ----- submit ----- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!file) { setError(t('upload.selectAudio')); return; }
    setLoading(true);
    setStage('uploading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      if (artist) fd.append('artist', artist);
      if (album) fd.append('album', album);
      if (genre) fd.append('genre', genre);

      const res = await musicAPI.upload(fd);
      const newId = res.data.id;
      setStage('analyzing');
      setSuccess(`📂 "${res.data.title}" ${t('upload.uploaded')}`);

      const final = await musicAPI.waitForAnalysis(newId, {
        onUpdate: (data) => setStage(data.analysis_status === 'ready' ? 'ready' : 'analyzing'),
      });

      if (final.analysis_status === 'error') {
        setStage('error');
        setAnalysisError(final.analysis_error || t('errorBoundary.unknownError'));
        setError(t('upload.analysisFailed', { detail: final.analysis_error || '' }));
      } else {
        setStage('ready');
        setUploadedTrack(final);
        setSuccess(`🎵 "${final.title}" ${t('upload.fullyAnalyzed')}`);
        setTimeout(() => navigate(`/analyze/${newId}`), 1600);
      }
    } catch (err) {
      setStage('error');
      const status = err.response?.status;
      if (status === 409) setError(`⚠️ ${err.response.data.detail}`);
      else setError(err.response?.data?.detail || t('errorBoundary.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  const isBusy = loading || stage === 'analyzing' || stage === 'uploading';

  /* ----- spotify ----- */
  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSpotifyMsg('');
    try {
      const res = await musicAPI.spotifySearch(query, 10);
      setSpotifyResults(res.data || []);
    } catch {
      setSpotifyMsg(t('upload.spotify.searchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const handleAddSpotify = async (track) => {
    setAddingId(track.spotify_track_id);
    setSpotifyMsg('');
    try {
      await musicAPI.addSpotify(track.spotify_track_id);
      setSpotifyMsg(`✅ ${track.title} ${t('upload.spotify.added')}`);
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) setSpotifyMsg(`⚠️ ${err.response.data.detail}`);
      else setSpotifyMsg(t('upload.spotify.addFailed'));
    } finally {
      setAddingId(null);
    }
  };

  /* ----- stepper render ----- */
  const stageIndex = { idle: -1, uploading: 0, analyzing: 1, ready: 2, error: 2 }[stage];
  const renderStepper = (
    <div className="stepper">
      {STAGES.map((s, i) => {
        const isDone = stage === 'ready' ? i <= 2 : i < stageIndex;
        const isActive = stage !== 'ready' && i === stageIndex && stage !== 'error';
        const isErr = stage === 'error' && i === 2;
        const cls = `step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''} ${isErr ? 'is-done' : ''}`;
        return (
          <div key={s} className={cls}>
            <div className="step__dot">{isDone || isErr ? '✓' : i + 1}</div>
            <div className="step__label">{t(`upload.stage${s.charAt(0).toUpperCase() + s.slice(1)}`)}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="stack-lg">
      <Reveal className="page-head">
        <div className="page-head__eyebrow">📂 {t('upload.title')}</div>
        <h1 className="page-head__title">{t('upload.title')}</h1>
        <p className="page-head__sub">{t('upload.subtitle')}</p>
      </Reveal>

      {spotifyOn && (
        <Reveal>
          <div className="tabs" style={{ marginBottom: 24 }}>
            <button className={`tabs__btn ${tab === 'file' ? 'is-active' : ''}`} onClick={() => setTab('file')}>
              📂 {t('upload.tabFile')}
            </button>
            <button className={`tabs__btn ${tab === 'spotify' ? 'is-active' : ''}`} onClick={() => setTab('spotify')}>
              🟢 {t('upload.tabSpotify')}
            </button>
          </div>
        </Reveal>
      )}

      {tab === 'file' ? (
        <Reveal className="panel">
          {error && <div className="alert alert--error">{error}</div>}
          {success && <div className="alert alert--success">{success}</div>}

          {stage === 'idle' || stage === 'error' ? (
            <form onSubmit={handleSubmit}>
              <div
                className={`dropzone ${isDrag ? 'is-drag' : ''}`}
                onClick={openPicker}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
              >
                <div className="dropzone__icon" aria-hidden="true">🎵</div>
                <div className="dropzone__title">
                  {file ? `${t('upload.selectedFile')}: ${file.name}` : t('upload.dropInactive')}
                </div>
                <div className="dropzone__hint">{t('upload.dropHint', { formats: t('upload.formats') })}</div>

                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept=".mp3,.wav,.flac,.ogg"
                  onChange={onFileChange}
                />

                {file && (
                  <div className="chip" onClick={(e) => e.stopPropagation()}>
                    <span className="chip__name">{file.name}</span>
                    <button type="button" className="chip__remove" onClick={clearFile} aria-label={t('upload.removeFile')}>✕</button>
                  </div>
                )}
              </div>

              <div className="field" style={{ marginTop: 22 }}>
                <label className="field__label" htmlFor="up-title">
                  {t('upload.titleLabel')}
                  {aiAvailable === true && <span className="pill pill--accent">✨ {t('upload.aiReady')}</span>}
                  {aiAvailable === false && <span className="pill">🤖 {t('upload.aiNotConfigured')}</span>}
                </label>
                <div className="flex gap-sm" style={{ alignItems: 'center' }}>
                  <input
                    id="up-title"
                    className="input flex-1"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('upload.placeholderTitle')}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={handleAutoTag}
                    disabled={aiLoading || !file || aiAvailable === false}
                    title={aiAvailable === false ? t('upload.aiServiceMissing') : t('upload.aiTooltip')}
                  >
                    {aiLoading ? <><span className="spinner" /> {t('upload.autoFillLoading')}</> : `✨ ${t('upload.autoFill')}`}
                  </button>
                </div>
              </div>

              <div className="grid grid--3">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field__label" htmlFor="up-artist">{t('upload.artistLabel')}</label>
                  <input id="up-artist" className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={t('upload.placeholderArtist')} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field__label" htmlFor="up-album">{t('upload.albumLabel')}</label>
                  <input id="up-album" className="input" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={t('upload.placeholderAlbum')} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field__label" htmlFor="up-genre">{t('upload.genreLabel')}</label>
                  <input id="up-genre" className="input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder={t('upload.placeholderGenre')} />
                </div>
              </div>

              <div className="flex gap-sm mt-lg">
                <button type="submit" className="btn btn--primary btn--lg" disabled={isBusy || !file}>
                  {loading ? <><span className="spinner" /> {t('upload.submitting')}</> : `📂 ${t('upload.title')}`}
                </button>
                {stage === 'error' && (
                  <button type="button" className="btn btn--ghost" onClick={resetForm}>{t('common.cancel')}</button>
                )}
              </div>
            </form>
          ) : (
            <>
              {renderStepper()}
              <div className="text-center text-sm text-muted">
                {stage === 'analyzing' && `⏳ ${t('upload.analyzing')}`}
                {stage === 'ready' && `🎵 ${t('upload.complete')}`}
                {stage === 'error' && analysisError && (
                  <span className="text-danger">⚠️ {t('upload.analysisFailed', { detail: analysisError })}</span>
                )}
              </div>
              {stage === 'ready' && (
                <div className="text-center mt-md flex flex-col items-center gap-md">
                  <button className="btn btn--primary" onClick={() => navigate('/')}>{t('common.viewLibrary')}</button>
                  {uploadedTrack && (
                    <button className="btn btn--primary btn--sm" onClick={() => play(uploadedTrack)}>
                      ▶ {t('player.play')}
                    </button>
                  )}
                </div>
              )}
              {stage === 'error' && (
                <div className="text-center mt-md">
                  <button className="btn btn--ghost" onClick={resetForm}>{t('common.cancel')}</button>
                </div>
              )}
            </>
          )}
        </Reveal>
      ) : (
        <Reveal className="panel">
          {spotifyMsg && <div className="alert alert--info">{spotifyMsg}</div>}
          <div className="field__label">🔎 {t('upload.spotify.title')}</div>
          <div className="flex gap-sm mb-md">
            <input
              className="input flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('upload.spotify.searchPlaceholder')}
            />
            <button className="btn btn--primary" onClick={handleSearch} disabled={searching}>
              {searching ? <><span className="spinner" /> {t('upload.spotify.searching')}</> : t('upload.spotify.searchButton')}
            </button>
          </div>

          {spotifyResults.length === 0 ? (
            <p className="text-muted text-sm">{query ? t('upload.spotify.noResults') : t('upload.spotify.emptyQuery')}</p>
          ) : (
            <div className="stack">
              {spotifyResults.map((tr) => (
                <div key={tr.spotify_track_id} className="flex items-center gap-md" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  {tr.image_url && <img src={tr.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />}
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{tr.title}</div>
                    <div className="text-sm text-muted">{tr.artist}{tr.album ? ` · ${tr.album}` : ''}</div>
                  </div>
                  <button className="btn btn--primary btn--sm" disabled={addingId === tr.spotify_track_id} onClick={() => handleAddSpotify(tr)}>
                    {addingId === tr.spotify_track_id ? <><span className="spinner" /> {t('upload.spotify.adding')}</> : `＋ ${t('upload.spotify.add')}`}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted mt-md">ℹ️ {t('upload.spotify.note')}</p>
        </Reveal>
      )}
    </div>
  );
}
