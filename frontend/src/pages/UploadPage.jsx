import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { musicAPI } from '../services/api';

export default function UploadPage() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null); // null = checking

  useEffect(() => {
    musicAPI.aiStatus()
      .then(res => setAiAvailable(res.data.available))
      .catch(() => setAiAvailable(false));
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      // Auto-fill title from filename if empty
      if (!title) {
        const name = selected.name.replace(/\.[^/.]+$/, '');
        setTitle(name);
      }
    }
  };

  const handleAutoTag = async () => {
    if (!file) {
      setError('Please select a file first');
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
        setSuccess('✨ Metadata auto-filled successfully!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'AI tagging failed';
      setError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!file) {
      setError('Please select an audio file');
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
      setSuccess(`"${res.data.title}" uploaded successfully!`);

      // Reset form
      setFile(null);
      setTitle('');
      setArtist('');
      setAlbum('');
      setGenre('');

      // Navigate to dashboard after short delay
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Upload Music</h1>
        <p className="page-subtitle">Supported formats: MP3, WAV, FLAC, OGG</p>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="upload-file">Audio File *</label>
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
              Title *
              {aiAvailable === true && (
                <span style={{
                  marginLeft: 8,
                  fontSize: '0.7rem',
                  background: 'rgba(16,185,129,0.15)',
                  color: '#10b981',
                  padding: '2px 7px',
                  borderRadius: 99,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}>✦ AI ready</span>
              )}
              {aiAvailable === false && (
                <span style={{
                  marginLeft: 8,
                  fontSize: '0.7rem',
                  background: 'rgba(156,163,175,0.15)',
                  color: '#9ca3af',
                  padding: '2px 7px',
                  borderRadius: 99,
                  fontWeight: 600,
                }}>AI not configured</span>
              )}
            </label>
            <div className="flex gap-sm" style={{ alignItems: 'flex-start' }}>
              <input
                id="upload-title"
                className="form-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track title"
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAutoTag}
                disabled={aiLoading || !file || aiAvailable === false}
                title={
                  aiAvailable === false
                    ? 'AI service not configured (GEMINI_API_KEY missing)'
                    : 'Use AI to auto-fill metadata from filename'
                }
                style={{ whiteSpace: 'nowrap' }}
              >
                {aiLoading ? <><div className="spinner" /> Loading…</> : '✨ Auto-fill with AI'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-artist">Artist</label>
            <input
              id="upload-artist"
              className="form-input"
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist name"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-album">Album</label>
            <input
              id="upload-album"
              className="form-input"
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder="Album name"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upload-genre">Genre</label>
            <input
              id="upload-genre"
              className="form-input"
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g. rock, pop, electronic"
            />
          </div>

          <div className="flex gap-sm">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              id="upload-submit"
            >
              {loading ? <><div className="spinner" /> Uploading…</> : '⬆ Upload'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

