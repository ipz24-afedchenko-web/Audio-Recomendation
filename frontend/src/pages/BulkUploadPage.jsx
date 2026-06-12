import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { musicAPI } from '../services/api';

/* ── Status constants ── */
const STATUS = {
  IDLE: 'idle',
  TAGGING: 'tagging',
  TAGGED: 'tagged',
  UPLOADING: 'uploading',
  DONE: 'done',
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
  const map = {
    [STATUS.IDLE]:     { label: 'Очікує',       color: '#606070', bg: 'rgba(96,96,112,0.12)' },
    [STATUS.TAGGING]:  { label: 'AI обробка…',  color: '#f39c12', bg: 'rgba(243,156,18,0.12)' },
    [STATUS.TAGGED]:   { label: 'Готовий',       color: '#2ecc71', bg: 'rgba(46,204,113,0.12)' },
    [STATUS.UPLOADING]:{ label: 'Завантажую…',  color: '#3498db', bg: 'rgba(52,152,219,0.12)' },
    [STATUS.DONE]:     { label: '✓ Завантажено', color: '#2ecc71', bg: 'rgba(46,204,113,0.12)' },
    [STATUS.ERROR]:    { label: '✗ Помилка',     color: '#e74c3c', bg: 'rgba(231,76,60,0.12)'  },
  };
  const s = map[status] || map[STATUS.IDLE];
  return (
    <span title={error || ''} style={{
      fontSize: '0.72rem', fontWeight: 600, padding: '2px 9px',
      borderRadius: 99, background: s.bg, color: s.color,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {status === STATUS.TAGGING || status === STATUS.UPLOADING
        ? <><SmallSpinner color={s.color} /> {s.label}</>
        : s.label}
    </span>
  );
}

function SmallSpinner({ color = '#6c5ce7' }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10,
      border: `2px solid rgba(255,255,255,0.15)`,
      borderTopColor: color, borderRadius: '50%',
      animation: 'spin 0.6s linear infinite', marginRight: 4,
      verticalAlign: 'middle',
    }} />
  );
}

/* ── Progress bar ── */
function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, height: 6, background: 'var(--border)',
        borderRadius: 99, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent), #a29bfe)',
          borderRadius: 99, transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 40 }}>
        {done}/{total}
      </span>
    </div>
  );
}

/* ── Inline editable field ── */
function InlineField({ value, placeholder, onChange, disabled }) {
  return (
    <input
      className="form-input"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{ padding: '5px 9px', fontSize: '0.8rem', height: 30 }}
    />
  );
}

/* ── Track row ── */
function TrackRow({ track, onUpdate, onRemove, onTagOne, aiAvailable }) {
  const busy = track.status === STATUS.TAGGING || track.status === STATUS.UPLOADING;
  const done = track.status === STATUS.DONE;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto',
      gap: 8, alignItems: 'center',
      padding: '10px 14px',
      background: done ? 'rgba(46,204,113,0.04)' : 'var(--bg-input)',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${done ? 'rgba(46,204,113,0.2)' : 'var(--border)'}`,
      transition: 'all 0.25s ease',
    }}>
      {/* Title */}
      <InlineField
        value={track.title}
        placeholder="Назва"
        onChange={v => onUpdate('title', v)}
        disabled={busy || done}
      />
      {/* Artist */}
      <InlineField
        value={track.artist}
        placeholder="Виконавець"
        onChange={v => onUpdate('artist', v)}
        disabled={busy || done}
      />
      {/* Album */}
      <InlineField
        value={track.album}
        placeholder="Альбом"
        onChange={v => onUpdate('album', v)}
        disabled={busy || done}
      />
      {/* Genre */}
      <InlineField
        value={track.genre}
        placeholder="Жанр"
        onChange={v => onUpdate('genre', v)}
        disabled={busy || done}
      />

      {/* Status badge */}
      <StatusBadge status={track.status} error={track.error} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {!done && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onTagOne}
            disabled={busy || !aiAvailable}
            title={aiAvailable ? 'AI автозаповнення' : 'AI недоступний'}
            style={{ padding: '4px 8px', fontSize: '0.7rem' }}
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
            title="Видалити"
            style={{ padding: '4px 8px', fontSize: '0.7rem' }}
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
  const cols = ['Назва *', 'Виконавець', 'Альбом', 'Жанр', 'Статус', ''];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto',
      gap: 8, padding: '0 14px 6px',
    }}>
      {cols.map(c => (
        <span key={c} style={{
          fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>{c}</span>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════
   Main Page Component
   ════════════════════════════════════════════ */
export default function BulkUploadPage() {
  const navigate = useNavigate();
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
        error: err.response?.data?.detail || 'AI помилка',
      });
    }
  };

  /* ── Auto-tag ALL idle tracks sequentially ── */
  const tagAll = async () => {
    if (!aiAvailable) return;
    setPhase('tagging');
    setGlobalMsg(null);

    const toTag = tracks.filter(t =>
      t.status === STATUS.IDLE || t.status === STATUS.ERROR || t.status === STATUS.TAGGED
    );

    for (const track of toTag) {
      await tagOne(track.id);
    }
    setPhase('idle');
    setGlobalMsg({ type: 'success', text: `✨ AI автозаповнення завершено для ${toTag.length} треків` });
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
      patchTrack(id, { status: STATUS.DONE, uploadedId: res.data.id });
    } catch (err) {
      patchTrack(id, {
        status: STATUS.ERROR,
        error: err.response?.data?.detail || 'Помилка завантаження',
      });
    }
  };

  /* ── Upload ALL tracks ── */
  const uploadAll = async () => {
    setPhase('uploading');
    setGlobalMsg(null);

    const toUpload = tracks.filter(t =>
      t.status !== STATUS.DONE && t.status !== STATUS.UPLOADING
    );

    // Upload in parallel (max 3 concurrent)
    const CHUNK = 3;
    for (let i = 0; i < toUpload.length; i += CHUNK) {
      await Promise.all(toUpload.slice(i, i + CHUNK).map(t => uploadOne(t.id)));
    }

    setPhase('done');
    const doneCount = tracks.filter(t => t.status === STATUS.DONE).length + toUpload.filter(t => t.status !== STATUS.ERROR).length;
    setGlobalMsg({ type: 'success', text: `✓ Завантажено ${toUpload.length} треків` });
  };

  /* ── Derived counts ── */
  const counts = {
    total: tracks.length,
    tagged: tracks.filter(t => t.status === STATUS.TAGGED || t.status === STATUS.DONE).length,
    done: tracks.filter(t => t.status === STATUS.DONE).length,
    errors: tracks.filter(t => t.status === STATUS.ERROR).length,
    uploadable: tracks.filter(t => t.status !== STATUS.DONE).length,
  };

  const allDone = counts.total > 0 && counts.done === counts.total;
  const busy = phase === 'tagging' || phase === 'uploading';

  return (
    <>
      {/* ── Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Масове завантаження</h1>
          <p className="page-subtitle">
            Перетягніть кілька файлів, AI автоматично визначить жанр, виконавця та назву
          </p>
        </div>

        {/* AI status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {aiAvailable === true && (
            <span style={{
              fontSize: '0.75rem', fontWeight: 600, padding: '4px 12px',
              borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#10b981',
            }}>✦ AI ready</span>
          )}
          {aiAvailable === false && (
            <span style={{
              fontSize: '0.75rem', fontWeight: 600, padding: '4px 12px',
              borderRadius: 99, background: 'rgba(156,163,175,0.12)', color: '#9ca3af',
            }}>AI not configured</span>
          )}
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-light)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '40px 24px',
          textAlign: 'center',
          cursor: busy ? 'default' : 'pointer',
          background: dragging ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
          transition: 'all 0.2s ease',
          marginBottom: 24,
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: 0.7 }}>🎵</div>
        <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {dragging ? 'Відпустіть файли тут' : 'Перетягніть аудіофайли сюди'}
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          або натисніть для вибору · MP3, WAV, FLAC, OGG
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.wav,.flac,.ogg"
          style={{ display: 'none' }}
          onChange={onFileInput}
        />
      </div>

      {/* ── Global message ── */}
      {globalMsg && (
        <div className={`alert alert-${globalMsg.type === 'success' ? 'success' : 'error'}`}
          style={{ marginBottom: 16 }}>
          {globalMsg.text}
        </div>
      )}

      {/* ── Toolbar (only if tracks exist) ── */}
      {tracks.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, flexWrap: 'wrap',
        }}>
          {/* Autofill all */}
          <button
            className="btn btn-secondary"
            onClick={tagAll}
            disabled={busy || !aiAvailable || allDone}
            style={{ gap: 6 }}
          >
            {phase === 'tagging'
              ? <><SmallSpinner /> AI обробка…</>
              : '✨ AI автозаповнення всіх'}
          </button>

          {/* Upload all */}
          <button
            className="btn btn-primary"
            onClick={uploadAll}
            disabled={busy || counts.uploadable === 0}
            style={{ gap: 6 }}
          >
            {phase === 'uploading'
              ? <><SmallSpinner color="white" /> Завантаження…</>
              : `⬆ Завантажити всі (${counts.uploadable})`}
          </button>

          {/* Clear done */}
          {counts.done > 0 && !busy && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setTracks(t => t.filter(x => x.status !== STATUS.DONE))}
            >
              Очистити завантажені
            </button>
          )}

          {/* Clear all */}
          {!busy && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => { setTracks([]); setGlobalMsg(null); setPhase('idle'); }}
            >
              Очистити все
            </button>
          )}

          {/* Stats */}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {counts.done}/{counts.total} завантажено
            {counts.errors > 0 && <> · <span style={{ color: 'var(--danger)' }}>{counts.errors} помилок</span></>}
          </span>
        </div>
      )}

      {/* ── Progress bar (during bulk ops) ── */}
      {(phase === 'tagging' || phase === 'uploading') && tracks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ProgressBar
            done={phase === 'uploading' ? counts.done : counts.tagged}
            total={counts.total}
          />
        </div>
      )}

      {/* ── Track list ── */}
      {tracks.length > 0 ? (
        <div className="card" style={{ padding: '12px 12px' }}>
          <TrackHeaders />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        /* ── Empty state ── */
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-text">Файли ще не вибрані</div>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            Вибрати файли
          </button>
        </div>
      )}

      {/* ── Footer actions ── */}
      {allDone && (
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Перейти до Дашборду
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setTracks([]); setGlobalMsg(null); setPhase('idle'); }}
          >
            Завантажити ще
          </button>
        </div>
      )}
    </>
  );
}
