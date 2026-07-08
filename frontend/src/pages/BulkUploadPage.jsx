import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { musicAPI } from '../services/api';
import strings from '../strings';

/* ── Status constants ── */
const STATUS = {
  IDLE: 'idle',
  TAGGING: 'tagging',
  TAGGED: 'tagged',
  UPLOADING: 'uploading',
  // Set after the server accepted the file but before its background
  // analysis finishes.  The row stays in this state until the polling
  // helper resolves the track's final status.
  ANALYZING: 'analyzing',
  DONE: 'done',
  // Permanent failure (validation / network / dedup / analysis error).
  ERROR: 'error',
};

const ALLOWED = new Set(['.mp3', '.wav', '.flac', '.ogg']);

function ext(name) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function makeTrack(file) {
  return {
    id: uid(),
    file,
    title: file.name.replace(/\.[^/.]+$/, ''),
    artist: '',
    album: '',
    genre: '',
    status: STATUS.IDLE,
    error: null,
    uploadedId: null,
  };
}

/* ── Status badge ── */
function StatusBadge({ status, error }) {
  useTranslation();
  const map = {
    [STATUS.IDLE]:     { label: strings.bulk.status.idle,     color: '#606070', bg: 'rgba(96,96,112,0.12)' },
    [STATUS.TAGGING]:  { label: strings.bulk.status.tagging,  color: '#f39c12', bg: 'rgba(243,156,18,0.12)' },
    [STATUS.TAGGED]:   { label: strings.bulk.status.tagged,   color: '#2ecc71', bg: 'rgba(46,204,113,0.12)' },
    [STATUS.UPLOADING]:{ label: strings.bulk.status.uploading,color: '#3498db', bg: 'rgba(52,152,219,0.12)' },
    [STATUS.ANALYZING]:{ label: strings.bulk.status.analyzing,color: '#9b59b6', bg: 'rgba(155,89,182,0.12)' },
    [STATUS.DONE]:     { label: strings.bulk.status.done,     color: '#2ecc71', bg: 'rgba(46,204,113,0.12)' },
    [STATUS.ERROR]:    { label: strings.bulk.status.error,    color: '#e74c3c', bg: 'rgba(231,76,60,0.12)'  },
  };
  const s = map[status] || map[STATUS.IDLE];
  return (
    <span title={error || ''} className="pill flex-shrink-0"
      style={{ background: s.bg, color: s.color }}>
      {status === STATUS.TAGGING || status === STATUS.UPLOADING || status === STATUS.ANALYZING
        ? <><SmallSpinner color={s.color} /> {s.label}</>
        : s.label}
    </span>
  );
}

function SmallSpinner({ color = '#6c5ce7' }) {
  return <span className="small-spinner" style={{ borderTopColor: color }} />;
}

/* ── Progress bar ── */
function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex-center gap-sm">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted progress-label">
        {done}/{total}
      </span>
    </div>
  );
}

/* ── Inline editable field ── */
function InlineField({ value, placeholder, onChange, disabled }) {
  return (
    <input
      className="form-input form-input-sm"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

/* ── Track row ── */
function TrackRow({ track, onUpdate, onRemove, onTagOne, aiAvailable }) {
  useTranslation();
  const busy =
    track.status === STATUS.TAGGING ||
    track.status === STATUS.UPLOADING ||
    track.status === STATUS.ANALYZING;
  const done = track.status === STATUS.DONE;

  return (
    <div className="track-row" style={{
      background: done ? 'rgba(46,204,113,0.04)' : 'var(--bg-input)',
      borderColor: done ? 'rgba(46,204,113,0.2)' : 'var(--border)',
    }}>
      {/* Title */}
      <InlineField
        value={track.title}
        placeholder={strings.bulk.placeholder.title}
        onChange={v => onUpdate('title', v)}
        disabled={busy || done}
      />
      {/* Artist */}
      <InlineField
        value={track.artist}
        placeholder={strings.bulk.placeholder.artist}
        onChange={v => onUpdate('artist', v)}
        disabled={busy || done}
      />
      {/* Album */}
      <InlineField
        value={track.album}
        placeholder={strings.bulk.placeholder.album}
        onChange={v => onUpdate('album', v)}
        disabled={busy || done}
      />
      {/* Genre */}
      <InlineField
        value={track.genre}
        placeholder={strings.bulk.placeholder.genre}
        onChange={v => onUpdate('genre', v)}
        disabled={busy || done}
      />

      {/* Status badge */}
      <StatusBadge status={track.status} error={track.error} />

      {/* Actions */}
      <div className="flex gap-xs flex-shrink-0">
        {!done && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onTagOne}
            disabled={busy || !aiAvailable}
            title={aiAvailable ? strings.bulk.tooltip.aiAutoFill : strings.bulk.tooltip.aiUnavailable}
          >
            {track.status === STATUS.TAGGING
              ? <SmallSpinner />
              : '✨'}
          </button>
        )}
        {!done && (
          <button
            className="btn btn-danger btn-sm"
            onClick={onRemove}
            disabled={busy}
            title={strings.bulk.tooltip.remove}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Column headers ── */
function TrackHeaders() {
  useTranslation();
  const cols = strings.bulk.columnHeaders;
  return (
    <div className="track-headers">
      {cols.map(c => (
        <span key={c} className="text-xs text-muted">{c}</span>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════
   Main Page Component
   ════════════════════════════════════════════ */
export default function BulkUploadPage() {
  const navigate = useNavigate();
  useTranslation();
  const fileInputRef = useRef(null);

  const [tracks, setTracks] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const [globalMsg, setGlobalMsg] = useState(null); // {type, text}
  const [phase, setPhase] = useState('idle'); // idle | tagging | uploading | done

  /* Check AI status once */
  React.useEffect(() => {
    musicAPI.aiStatus()
      .then(r => setAiAvailable(r.data.available))
      .catch(() => setAiAvailable(false));
  }, []);

  /* ── File ingestion ── */
  const addFiles = useCallback((files) => {
    const valid = Array.from(files).filter(f => ALLOWED.has(ext(f.name)));
    if (!valid.length) return;
    setTracks(prev => {
      const existingNames = new Set(prev.map(t => t.file.name));
      const fresh = valid.filter(f => !existingNames.has(f.name)).map(makeTrack);
      return [...prev, ...fresh];
    });
  }, []);

  const onFileInput = e => { addFiles(e.target.files); e.target.value = ''; };

  /* ── Drag & drop ── */
  const onDragOver = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  /* ── Update a single track field ── */
  const updateTrack = (id, field, value) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  /* ── Set track status (with optional metadata merge) ── */
  const patchTrack = (id, patch) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  /* ── Auto-tag a single track ── */
  const tagOne = async (id) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;

    patchTrack(id, { status: STATUS.TAGGING, error: null });

    try {
      const fd = new FormData();
      fd.append('filename', track.file.name);
      const res = await musicAPI.autoTag(fd);
      const meta = res.data.metadata || {};
      patchTrack(id, {
        status: STATUS.TAGGED,
        title:  meta.title  || track.title,
        artist: meta.artist || track.artist,
        album:  meta.album  || track.album,
        genre:  meta.genre  || track.genre,
      });
    } catch (err) {
      patchTrack(id, {
        status: STATUS.ERROR,
        error: err.response?.data?.detail || strings.bulk.messages.aiError,
      });
    }
  };

  /* ── Auto-tag ALL idle tracks in parallel (cap 4) ── */
  const tagAll = async () => {
    if (!aiAvailable) return;
    setPhase('tagging');
    setGlobalMsg(null);

    const toTag = tracks.filter(t =>
      t.status === STATUS.IDLE || t.status === STATUS.ERROR || t.status === STATUS.TAGGED
    );

    const CONCURRENCY = 4;
    const results = [];
    for (let i = 0; i < toTag.length; i += CONCURRENCY) {
      const batch = toTag.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(t => tagOne(t.id))
      );
      results.push(...batchResults);
    }

    const failed = results.filter(r => r.status === 'rejected').length;
    setPhase('idle');
    if (failed === 0) {
      setGlobalMsg({ type: 'success', text: strings.bulk.messages.tagSuccess(toTag.length) });
    } else {
      setGlobalMsg({ type: 'error', text: strings.bulk.messages.tagPartial(toTag.length - failed, failed) });
    }
  };

/* ── Upload a single track ── */
const uploadOne = async (id) => {
  const track = tracks.find(t => t.id === id);
  if (!track || track.status === STATUS.DONE) return;

  patchTrack(id, { status: STATUS.UPLOADING, error: null });

  try {
    const fd = new FormData();
    fd.append('file', track.file);
    fd.append('title', track.title || track.file.name);
    if (track.artist) fd.append('artist', track.artist);
    if (track.album)  fd.append('album',  track.album);
    if (track.genre)  fd.append('genre',  track.genre);

    const res = await musicAPI.upload(fd);
    const newId = res.data.id;
    patchTrack(id, {
      status: STATUS.ANALYZING,
      uploadedId: newId,
    });

    // Kick off background analysis polling.  We don't await this here
    // because the bulk uploader fires many uploads in parallel; the
    // status badge will tick from "Аналіз…" to "✓ Завантажено" on its
    // own once the server's analysis BackgroundTask finishes.
    pollUntilDone(id, newId);
  } catch (err) {
    const status = err.response?.status;
    let msg;
    if (status === 409) {
      msg = strings.bulk.messages.dupError(err.response.data.detail);
    } else {
      msg = err.response?.data?.detail || strings.bulk.messages.uploadError;
    }
    patchTrack(id, { status: STATUS.ERROR, error: msg });
  }
};

/* ── Poll server until analysis finishes ── */
const pollUntilDone = async (localId, serverId) => {
  try {
    const final = await musicAPI.waitForAnalysis(serverId, {
      intervalMs: 2000,
      timeoutMs: 120_000,
    });
    if (final.analysis_status === 'ready') {
      patchTrack(localId, { status: STATUS.DONE });
    } else if (final.analysis_status === 'error') {
      patchTrack(localId, {
        status: STATUS.ERROR,
        error: final.analysis_error || strings.bulk.messages.analysisError,
      });
    } else {
      patchTrack(localId, {
        status: STATUS.ANALYZING,
        error: strings.bulk.messages.analysisTimeout,
      });
    }
  } catch (e) {
    patchTrack(localId, {
      status: STATUS.ERROR,
      error: strings.bulk.messages.analysisCheckFailed,
    });
  }
};

  /* ── Upload ALL tracks ── */
  const uploadAll = async () => {
    setPhase('uploading');
    setGlobalMsg(null);

    const toUpload = tracks.filter((t) =>
      t.status !== STATUS.DONE &&
      t.status !== STATUS.UPLOADING &&
      t.status !== STATUS.ANALYZING
    );

    // Upload in parallel (max 3 concurrent)
    const CHUNK = 3;
    for (let i = 0; i < toUpload.length; i += CHUNK) {
      await Promise.all(toUpload.slice(i, i + CHUNK).map((t) => uploadOne(t.id)));
    }

    setPhase('done');
    setGlobalMsg({
      type: 'success',
      text: strings.bulk.messages.uploadSuccess(toUpload.length),
    });
  };

  /* ── Derived counts ── */
  // ``done`` here means "fully uploaded AND analysed".  Tracks still
  // in ANALYZING count as "in progress" (successfully accepted by the
  // server, just waiting on the BackgroundTask).  We surface the
  // ANALYZING count separately so the toolbar can show a useful
  // progress indicator.
  const counts = {
    total: tracks.length,
    tagged: tracks.filter((t) => t.status === STATUS.TAGGED || t.status === STATUS.DONE || t.status === STATUS.ANALYZING).length,
    done: tracks.filter((t) => t.status === STATUS.DONE).length,
    analyzing: tracks.filter((t) => t.status === STATUS.ANALYZING).length,
    errors: tracks.filter((t) => t.status === STATUS.ERROR).length,
    uploadable: tracks.filter(
      (t) => t.status !== STATUS.DONE && t.status !== STATUS.ANALYZING
    ).length,
  };

  const allDone = counts.total > 0 && counts.done === counts.total;
  const busy =
    phase === 'tagging' ||
    phase === 'uploading' ||
    tracks.some(
      (t) => t.status === STATUS.UPLOADING || t.status === STATUS.ANALYZING
    );

  return (
    <>
      {/* ── Header ── */}
      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">{strings.bulk.pageTitle}</h1>
          <p className="page-subtitle">
            {strings.bulk.pageSubtitle}
          </p>
        </div>

        {/* AI status */}
        <div className="flex-center gap-sm flex-shrink-0">
          {aiAvailable === true && (
            <span className="pill pill-success">✦ AI ready</span>
          )}
          {aiAvailable === false && (
            <span className="pill pill-muted">AI not configured</span>
          )}
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className="drop-zone"
        style={{
          borderColor: dragging ? 'var(--accent)' : 'var(--border-light)',
          background: dragging ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        <div className="drop-zone-icon">🎵</div>
        <p className="drop-zone-text">
          {dragging ? strings.bulk.dropzone.active : strings.bulk.dropzone.inactive}
        </p>
        <p className="text-muted drop-zone-hint">
          {strings.bulk.dropzone.hint}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.wav,.flac,.ogg"
          className="sr-only"
          onChange={onFileInput}
        />
      </div>

      {/* ── Global message ── */}
      {globalMsg && (
        <div className={`alert alert-${globalMsg.type === 'success' ? 'success' : 'error'} mb-md`}>
          {globalMsg.text}
        </div>
      )}

      {/* ── Toolbar (only if tracks exist) ── */}
      {tracks.length > 0 && (
        <div className="flex-center flex-wrap mb-md gap-sm">
          <button
            className="btn btn-secondary gap-xs"
            onClick={tagAll}
            disabled={busy || !aiAvailable || allDone}
          >
            {phase === 'tagging'
              ? <><SmallSpinner /> {strings.bulk.aiButton.tagging}</>
              : `✨ ${strings.bulk.aiButton.idle}`}
          </button>

          <button
            className="btn btn-primary gap-xs"
            onClick={uploadAll}
            disabled={busy || counts.uploadable === 0}
          >
            {phase === 'uploading'
              ? <><SmallSpinner color="white" /> {strings.bulk.uploadButton.uploading}</>
              : strings.bulk.uploadButton.idle(counts.uploadable)}
          </button>

          {counts.done > 0 && !busy && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setTracks((t) => t.filter((x) => x.status !== STATUS.DONE))
              }
            >
              {strings.bulk.clearDone}
            </button>
          )}

          {!busy && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => { setTracks([]); setGlobalMsg(null); setPhase('idle'); }}
            >
              {strings.bulk.clearAll}
            </button>
          )}

          <span className="text-muted stats-text">
            {strings.bulk.stats.ready(counts.done, counts.total)}
            {counts.analyzing > 0 && (
              <> · <span className="text-purple">{strings.bulk.stats.analyzing(counts.analyzing)}</span></>
            )}
            {counts.errors > 0 && <> · <span className="text-danger">{strings.bulk.stats.errors(counts.errors)}</span></>}
          </span>
        </div>
      )}

      {(phase === 'tagging' || phase === 'uploading') && tracks.length > 0 && (
        <div className="mb-md">
          <ProgressBar
            done={
              phase === 'uploading'
                ? counts.done + counts.analyzing
                : counts.tagged
            }
            total={counts.total}
          />
        </div>
      )}

      {tracks.length > 0 ? (
        <div className="card card-compact">
          <TrackHeaders />
          <div className="flex-col gap-xs">
            {tracks.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                aiAvailable={aiAvailable}
                onUpdate={(field, value) => updateTrack(track.id, field, value)}
                onRemove={() => setTracks(prev => prev.filter(t => t.id !== track.id))}
                onTagOne={() => tagOne(track.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-text">{strings.bulk.empty.title}</div>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            {strings.bulk.empty.button}
          </button>
        </div>
      )}

      {allDone && (
        <div className="flex gap-sm mt-lg">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            {strings.bulk.footer.dashboard}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setTracks([]); setGlobalMsg(null); setPhase('idle'); }}
          >
            {strings.bulk.footer.uploadMore}
          </button>
        </div>
      )}
    </>
  );
}
