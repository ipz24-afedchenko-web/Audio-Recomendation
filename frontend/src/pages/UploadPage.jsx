import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { musicAPI } from '../services/api';
import strings from '../strings';

export default function UploadPage() {
  const navigate = useNavigate();
  useTranslation();

  /* ── Shared state ── */
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
  const [isDragover, setIsDragover] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    musicAPI
      .aiStatus()
      .then((res) => setAiAvailable(res.data.available))
      .catch(() => setAiAvailable(false));
  }, []);

  /* ── File selection ── */
  const applyFile = useCallback(
    (selected) => {
      if (!selected) return;
      setFile(selected);
      setError('');
      if (!title) {
        const name = selected.name.replace(/\.[^/.]+$/, '');
        setTitle(name);
      }
    },
    [title]
  );

  const handleFileChange = (e) => {
    applyFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragover(false);
    if (e.dataTransfer?.files?.length) {
      applyFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragover(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragover(false);
  };

  const openPicker = () => fileInputRef.current?.click();

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── AI auto-tag ── */
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
    } catch {
      setError(strings.upload.aiTaggingFailed);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Submit ── */
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
      setAnalysisStatus(res.data.analysis_status || 'pending');
      setSuccess(`📂 "${res.data.title}" ${strings.upload.uploaded}`);

      resetForm();
      setLoading(false);

      const final = await musicAPI.waitForAnalysis(newId, {
        onUpdate: (data) => setAnalysisStatus(data.analysis_status),
      });
      setAnalysisStatus(final.analysis_status);
      if (final.analysis_status === 'error') {
        setAnalysisError(final.analysis_error || strings.errorBoundary.unknownError);
        setError(
          strings.upload.analysisFailed.replace(
            '{{detail}}',
            final.analysis_error || strings.errorBoundary.unknownError
          )
        );
      } else {
        setSuccess(`🎵 "${final.title}" ${strings.upload.fullyAnalyzed}`);
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        setError(`⚠️ ${err.response.data.detail}`);
      } else {
        setError(
          err.response?.data?.detail ||
            strings.upload.analysisFailed.replace('{{detail}}', 'upload failed')
        );
      }
      setLoading(false);
    }
  };

  const isBusy =
    loading || analysisStatus === 'analyzing' || analysisStatus === 'pending';

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">📂 {strings.upload.title}</h1>
        <p className="page-subtitle">{strings.upload.subtitle}</p>
      </div>

      <div className="card card-narrow">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          {/* Drag & drop zone */}
          <div
            className={`drop-zone${isDragover ? ' is-dragover' : ''}`}
            onClick={openPicker}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
              }
            }}
            aria-label={strings.upload.dropzone.inactive}
          >
            <div className="drop-zone-icon" aria-hidden="true">🎵</div>
            <div className="drop-zone-text">
              {file ? strings.upload.dropzone.selected : strings.upload.dropzone.inactive}
            </div>
            <div className="drop-zone-hint">{strings.upload.dropzone.hint}</div>

            <input
              id="upload-file"
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".mp3,.wav,.flac,.ogg"
              onChange={handleFileChange}
            />

            {file && (
              <div className="file-chip" onClick={(e) => e.stopPropagation()}>
                <span className="file-chip-name">{file.name}</span>
                <button
                  type="button"
                  className="file-chip-remove"
                  onClick={clearFile}
                  aria-label={strings.common.cancel}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Title + AI auto-fill */}
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
                {aiLoading ? (
                  <><div className="spinner" /> {strings.upload.autoFillLoading}</>
                ) : (
                  `✨ ${strings.upload.autoFill}`
                )}
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
              disabled={isBusy || !file}
              id="upload-submit"
            >
              {loading ? (
                <><div className="spinner" /> {strings.upload.uploading}</>
              ) : analysisStatus === 'analyzing' || analysisStatus === 'pending' ? (
                <><div className="spinner" /> {strings.upload.analyzing}</>
              ) : (
                `📂 ${strings.upload.submit}`
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { resetForm(); navigate('/'); }}
              disabled={isBusy}
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
      </div>
    </>
  );
}
