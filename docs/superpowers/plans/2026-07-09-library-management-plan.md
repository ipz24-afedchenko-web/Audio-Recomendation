# Library Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch delete, search, and a reusable Modal component to the music library dashboard.

**Architecture:** Backend adds search filter to existing `GET /api/music/user/{id}` + new `POST /api/music/batch-delete` for bulk delete. Frontend adds Modal component, SelectionBar, search input, and track checkboxes to DashboardPage.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy 2.0, Pydantic v2, React 18, JavaScript (no TS), Axios, CSS (no framework)

## Global Constraints

- All new backend routes use Pydantic v2 (`BaseModel`, `Field`)
- Auth: every mutation checks `music.user_id == current_user.id`
- No `print()` — use `logger = logging.getLogger(__name__)`
- Frontend files are `.jsx` or `.js`, no TypeScript
- Axios with `withCredentials: true` (already set in `services/api.js`)
- No new npm packages (Modal is custom, no UI library)

---

### Task 1: Backend — Add search (`q`) param to `GET /api/music/user/{user_id}`

**Files:**
- Modify: `backend/app/routes/music.py:204` (`get_user_music` function)
- Test: `backend/tests/test_music_routes.py`

**Interfaces:**
- Consumes: existing `get_user_music` endpoint
- Produces: `GET /api/music/user/{user_id}?q=string` with ILIKE filtering

- [ ] **Step 1: Write the failing test**

Add to `test_music_routes.py`:

```python
def test_get_user_music_search_filters_by_title(client, db_session, auth_headers):
    from app.models.music import Music
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    t1 = Music(title="Bohemian Rhapsody", artist="Queen", user_id=uid, file_path="/dev/null/1.mp3")
    t2 = Music(title="Another One Bites the Dust", artist="Queen", user_id=uid, file_path="/dev/null/2.mp3")
    t3 = Music(title="Yesterday", artist="Beatles", user_id=uid, file_path="/dev/null/3.mp3")
    db_session.add_all([t1, t2, t3])
    db_session.commit()

    r = client.get(f"/api/music/user/{uid}?q=Bohemian", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["title"] == "Bohemian Rhapsody"


def test_get_user_music_search_filters_by_artist(client, db_session, auth_headers):
    from app.models.music import Music
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    t1 = Music(title="Song A", artist="Artist One", user_id=uid, file_path="/dev/null/1.mp3")
    t2 = Music(title="Song B", artist="Artist Two", user_id=uid, file_path="/dev/null/2.mp3")
    db_session.add_all([t1, t2])
    db_session.commit()

    r = client.get(f"/api/music/user/{uid}?q=One", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["artist"] == "Artist One"


def test_get_user_music_search_no_match_returns_empty(client, db_session, auth_headers):
    from app.models.music import Music
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    t = Music(title="Exists", artist="Someone", user_id=uid, file_path="/dev/null/1.mp3")
    db_session.add(t)
    db_session.commit()

    r = client.get(f"/api/music/user/{uid}?q=NonExistent", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_get_user_music_search_no_q_returns_all(client, db_session, auth_headers):
    """When q is omitted, all tracks are returned (backward compat)."""
    from app.models.music import Music
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    t1 = Music(title="A", artist="X", user_id=uid, file_path="/dev/null/1.mp3")
    t2 = Music(title="B", artist="Y", user_id=uid, file_path="/dev/null/2.mp3")
    db_session.add_all([t1, t2])
    db_session.commit()

    r = client.get(f"/api/music/user/{uid}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_music_routes.py::test_get_user_music_search_filters_by_title tests/test_music_routes.py::test_get_user_music_search_filters_by_artist tests/test_music_routes.py::test_get_user_music_search_empty_match_returns tests/test_music_routes.py::test_get_user_music_search_no_q_returns_all -v`
Expected: FAIL (endpoint doesn't handle `q` yet)

- [ ] **Step 3: Modify `get_user_music` to accept `q` param**

In `backend/app/routes/music.py`, modify `get_user_music` (~line 204). Add `q` as an optional query parameter and apply ILIKE filter:

```python
def get_user_music(
    user_id: int,
    q: str | None = Query(None, description="Search by title, artist, or album"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")
    query = db.query(Music).filter(Music.user_id == user_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.func.concat(Music.title, ' ', Music.artist, ' ', Music.album).ilike(like)
        )
    tracks = query.order_by(Music.created_at.desc()).limit(100).all()
    return tracks
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_music_routes.py::test_get_user_music_search_filters_by_title tests/test_music_routes.py::test_get_user_music_search_filters_by_artist tests/test_music_routes.py::test_get_user_music_search_empty_match_returns tests/test_music_routes.py::test_get_user_music_search_no_q_returns -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/music.py backend/tests/test_music_routes.py
git commit -m "feat: add search query param to GET /api/music/user/{id}"
```

---

### Task 2: Backend — `POST /api/music/batch-delete`

**Files:**
- Create: (new schema in) `backend/app/schemas/music.py`
- Modify: `backend/app/routes/music.py` (new route)
- Test: `backend/tests/test_music_routes.py`

**Interfaces:**
- Produces: `POST /api/music/batch-delete` with body `{ ids: number[], delete_all?: boolean }` → `{ deleted: number }`

- [ ] **Step 1: Add `BatchDeleteRequest` schema**

In `backend/app/schemas/music.py`:

```python
from pydantic import BaseModel, Field

class BatchDeleteRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)
    delete_all: bool = False
```

- [ ] **Step 2: Write the failing tests**

Add to `test_music_routes.py`:

```python
from app.schemas.music import BatchDeleteRequest


def test_batch_delete_removes_selected_tracks(client, db_session, auth_headers):
    from app.models.music import Music
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    t1 = Music(title="A", user_id=uid, file_path="/dev/null/a.mp3")
    t2 = Music(title="B", user_id=uid, file_path="/dev/null/b.mp3")
    t3 = Music(title="C", user_id=uid, file_path="/dev/null/c.mp3")
    db_session.add_all([t1, t2, t3])
    db_session.commit()
    ids = [t1.id, t3.id]

    r = client.post("/api/music/batch-delete", json={"ids": ids}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["deleted"] == 2

    remaining = db_session.query(Music).filter(Music.user_id == uid).all()
    assert len(remaining) == 1
    assert remaining[0].id == t2.id


def test_batch_delete_all_removes_all(client, db_session, auth_headers):
    from app.models.music import Music
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    db_session.add_all([
        Music(title="X", user_id=uid, file_path="/dev/null/x.mp3"),
        Music(title="Y", user_id=uid, file_path="/dev/null/y.mp3"),
    ])
    db_session.commit()

    r = client.post("/api/music/batch-delete", json={"delete_all": True}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["deleted"] == 2
    remaining = db_session.query(Music).filter(Music.user_id == uid).all()
    assert len(remaining) == 0


def test_batch_delete_other_user_rejected(client, db_session, auth_headers):
    from app.models.user import User
    from app.models.music import Music
    current_user = db_session.query(User).first()
    other = User(email="other@x.com", username="other", hashed_password="x", is_active=True)
    db_session.add(other)
    db_session.commit()
    t = Music(title="Other's track", user_id=other.id, file_path="/dev/null/o.mp3")
    db_session.add(t)
    db_session.commit()

    r = client.post("/api/music/batch-delete", json={"ids": [t.id]}, headers=auth_headers)
    assert r.status_code == 404  # track not found for this user


def test_batch_delete_error_on_empty(client, db_session, auth_headers):
    r = client.post("/api/music/batch-delete", json={"ids": []}, headers=auth_headers)
    assert r.status_code == 400
    assert "Nothing to delete" in r.json()["detail"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_music_routes.py::test_batch_delete_removes_selected_tracks tests/test_music_routes.py::test_batch_delete_removes_correct_tracks tests/test_music_routes.py::test_batch_delete_other_user_rejected tests/test_music_routes.py::test_batch_delete_error_on_empty -v`
Expected: FAIL with 405 or connection refused

- [ ] **Step 4: Implement `POST /api/music/batch-delete`**

In `backend/app/routes/music.py`, add:

```python
import os
from app.schemas.music import BatchDeleteRequest


@router.post("/batch-delete", status_code=status.HTTP_200_OK)
def batch_delete_music(
    payload: BatchDeleteRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not payload.ids and not payload.delete_all:
        raise HTTPException(status_code=400, detail="Nothing to delete")
    
    query = db.query(Music).filter(Music.user_id == current_user.id)
    if payload.delete_all:
        tracks = query.all()
    else:
        tracks = query.filter(Music.id.in_(payload.ids)).all()

    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    ids = [t.id for t in tracks]
    file_paths = [t.file_path for t in tracks if t.file_path]

    # Bulk delete (child rows cascade via ON DELETE CASCADE)
    db.query(Music).filter(Music.id.in_(ids)).delete(synchronize_session=False)
    db.commit()

    # Clean up files from disk
    for fp in file_paths:
        try:
            os.remove(fp)
        except FileNotFoundError:
            pass

    return {"deleted": len(ids)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest -q tests/test_music_routes.py::test_batch_delete_removes_selected_tracks tests/test_music_routes.py::test_batch_delete_all_removes_all tests/test_music_routes.py::test_batch_delete_other_user_rejected tests/test_music_routes.py::test_batch_delete_error_on_empty -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/music.py backend/app/routes/music.py backend/tests/test_music_routes.py
git commit -m "feat: add POST /api/music/batch-delete"
```

---

### Task 3: Frontend — Modal component

**Files:**
- Create: `frontend/src/components/Modal.jsx`
- Modify: `frontend/src/styles/index.css`

- [ ] **Step 1: Write `Modal.jsx`**

```jsx
import { useEffect, useRef } from 'react';

export default function Modal({ isOpen, onClose, title, children, footer }) {
  const focusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      focusRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Modal CSS**

In `frontend/src/styles/index.css`, add:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-card {
  background: var(--bg-card, #fff);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border, #e0e0e0);
}
.modal-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}
.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  color: var(--text-muted, #666);
}
.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  font-size: 0.95rem;
  line-height: 1.5;
}
.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--border, #e0e0e0);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
```

- [ ] **Step 3: Verify Modal renders (manual check)**

Build: `cd frontend && npm run build`
Expected: Build succeeds (no runtime test possible without rendering)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Modal.jsx frontend/src/styles/index.css
git commit -m "feat: add reusable Modal component"
```

---

### Task 4: Frontend — Update `api.js` with new methods

**Files:**
- Modify: `frontend/src/services/api.js`

- [ ] **Step 1: Add `batchDelete`, `deleteAll`, and update `getUserMusic`**

Replace the existing `delete` and update `getUserMusic`:

```javascript
delete(id) {
  return api.delete(`/music/${id}`).then(r => r.data);
},

deleteBatch(ids) {
  return api.post('/music/batch-delete', { ids }).then(r => r.data);
},

deleteAll() {
  return api.post('/music/batch-delete', { delete_all: true }).then(r => r.data);
},

getUserMusic(userId, q = '') {
  const params = q ? { q } : {};
  return api.get(`/music/user/${userId}`, { params }).then(r => r.data);
},
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "feat: add batchDelete, deleteAll to musicAPI"
```

---

### Task 5: Frontend — Update DashboardPage with search, checkboxes, SelectionBar, Modal

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/styles/index.css`

- [ ] **Step 1: Rewrite DashboardPage**

Full component (paste over existing content):

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { musicAPI } from '../services/api';
import Modal from '../components/Modal';
import { useTranslation } from 'react-i18next';

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState(null); // { ids: number[] | 'all', count: number }
  const [deleting, setDeleting] = useState(false);

  const loadTracks = useCallback(async (q) => {
    try {
      setLoading(true);
      setError(null);
      const data = await musicAPI.getUserMusic(user.id, q || '');
      setTracks(data);
    } catch (err) {
      setError(err.response?.data?.detail || t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user.id, t]);

  useEffect(() => {
    if (user) loadTracks(searchQuery);
  }, [user, loadTracks]);

  let searchTimer = null;
  const handleSearch = (value) => {
    setSearchQuery(value);
    setSelectedIds(new Set());
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadTracks(value), 300);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === tracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tracks.map((t) => t.id)));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('dashboard.deleteConfirm'))) return;
    setBusyId(id);
    try {
      await musicAPI.delete(id);
      setTracks((prev) => prev.filter((t) => t.id !== id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (err) {
      setError(err.response?.data?.detail || t('dashboard.deleteError'));
    } finally {
      setBusyId(null);
    }
  };

  const openBatchConfirm = () => {
    setConfirmModal({ ids: Array.from(selectedIds), count: selectedIds.size });
  };

  const openDeleteAllConfirm = () => {
    setConfirmModal({ ids: 'all', count: tracks.length });
  };

  const executeBatchDelete = async () => {
    setDeleting(true);
    try {
      let result;
      if (confirmModal.ids === 'all') {
        result = await musicAPI.deleteAll();
      } else {
        result = await musicAPI.deleteBatch(confirmModal.ids);
      }
      setConfirmModal(null);
      setSelectedIds(new Set());
      // If deleted all visible tracks, reset is handled by searchQuery change implicitly
      await loadTracks(searchQuery);
    } catch (err) {
      setError(err.response?.data?.detail || t('dashboard.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && tracks.length === 0) {
    return <div className="loading">{t('dashboard.loading')}</div>;
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>{t('dashboard.title')}</h1>
        {tracks.length > 0 && (
          <button className="btn btn--danger" onClick={openDeleteAllConfirm}>
            {t('dashboard.deleteAll')}
          </button>
        )}
      </div>

      <div className="search-bar">
        <input
          type="search"
          placeholder={t('dashboard.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {tracks.length === 0 && !loading && (
        <div className="empty-state">
          {searchQuery ? t('dashboard.noSearchResults') : t('dashboard.empty')}
        </div>
      )}

      <div className="library-grid">
        {tracks.map((track) => (
          <div
            key={track.id}
            className={`track-card${selectedIds.has(track.id) ? ' track-card--selected' : ''}`}
          >
            <label className="track-card__checkbox">
              <input
                type="checkbox"
                checked={selectedIds.has(track.id)}
                onChange={() => toggleSelect(track.id)}
              />
            </label>
            <div className="track-card__art">
              {track.genre === 'electronic' ? '🎹' : track.genre === 'jazz' ? '🎷' : track.genre === 'classical' ? '🎻' : track.genre === 'rock' ? '🎸' : track.genre === 'hip-hop' || track.genre === 'rap' ? '🎤' : track.genre === 'pop' ? '🎵' : '🎶'}
            </div>
            <div className="track-card__info">
              <h3 className="track-card__title">{track.title}</h3>
              <p className="track-card__artist">{track.artist}</p>
              <p className="track-card__album">{track.album}</p>
              <p className="track-card__meta">
                <span className="track-card__duration">{track.duration ? `${Math.round(track.duration / 60)}:${String(Math.round(track.duration % 60)).padStart(2, '0')}` : '--:--'}</span>
                {track.file_size && <span className="track-card__size">{t('dashboard.mb', { size: (track.file_size / (1024 * 1024)).toFixed(1) })}</span>}
                {track.source === 'spotify' && <span className="badge badge--spotify">Spotify</span>}
                {track.analysis_status === 'ready' && <span className="badge badge--ready">{t('dashboard.analyzed')}</span>}
                {track.analysis_status === 'pending' && <span className="badge badge--pending">{t('dashboard.pending')}</span>}
                {track.analysis_status === 'error' && <span className="badge badge--error">{t('dashboard.error')}</span>}
              </p>
              {track.genre && <span className="track-card__genre">{track.genre}</span>}
            </div>
            <div className="track-card__actions">
              <button
                className="btn btn--primary btn--sm"
                onClick={() => window.location.href = `/analyze/${track.id}`}
              >
                {track.analysis_status === 'ready' ? t('dashboard.viewAnalysis') : t('dashboard.analyze')}
              </button>
              <button
                className="btn btn--danger btn--sm"
                onClick={() => handleDelete(track.id)}
                disabled={busyId === track.id}
              >
                {busyId === track.id ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-bar__count">
            {t('dashboard.selected', { count: selectedIds.size })}
          </span>
          <label className="selection-bar__select-all">
            <input
              type="checkbox"
              checked={selectedIds.size === tracks.length && tracks.length > 0}
              onChange={selectAll}
            />
            {' '}{t('dashboard.selectAll')}
          </label>
          <button className="btn btn--danger" onClick={openBatchConfirm}>
            {t('dashboard.deleteSelected')}
          </button>
        </div>
      )}

      <Modal
        isOpen={confirmModal !== null}
        onClose={() => !deleting && setConfirmModal(null)}
        title={t('dashboard.confirmDeleteTitle')}
        footer={
          <>
            <button className="btn" onClick={() => setConfirmModal(null)} disabled={deleting}>
              {t('common.cancel')}
            </button>
            <button className="btn btn--danger" onClick={executeBatchDelete} disabled={deleting}>
              {deleting ? t('common.deleting') : t('common.delete')}
            </button>
          </>
        }
      >
        <p>
          {confirmModal?.ids === 'all'
            ? t('dashboard.confirmDeleteAll', { count: confirmModal.count })
            : t('dashboard.confirmDeleteBatch', { count: confirmModal?.count })}
        </p>
        {deleting && <p className="text-muted">{t('dashboard.deletingInProgress')}</p>}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Add new CSS classes**

In `frontend/src/styles/index.css`, add:

```css
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.dashboard-header h1 {
  margin: 0;
}

.search-bar {
  margin-bottom: 18px;
}
.search-bar input {
  width: 100%;
  max-width: 400px;
  padding: 10px 14px;
  border: 1px solid var(--border, #ccc);
  border-radius: 8px;
  font-size: 0.95rem;
  background: var(--bg-input, #f5f5f5);
  color: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.search-bar input:focus {
  border-color: var(--primary, #4361ee);
}

.track-card {
  position: relative;
}
.track-card--selected {
  outline: 2px solid var(--primary, #4361ee);
  outline-offset: -2px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary, #4361ee) 8%, transparent);
}
.track-card__checkbox {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
}
.track-card__checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary, #4361ee);
}

.selection-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  background: var(--bg-card, #fff);
  border-top: 1px solid var(--border, #e0e0e0);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
}
.selection-bar__count {
  font-weight: 600;
  white-space: nowrap;
}
.selection-bar__select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.selection-bar__select-all input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary, #4361ee);
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Add i18n keys (if using translations)**

Check if `frontend/src/i18n/locales` exists. If so, add to `en.json` and `uk.json` (or whatever languages are used):

```json
{
  "dashboard": {
    "searchPlaceholder": "Search by title, artist, album...",
    "emptySearchResults": "No tracks match your search.",
    "selected": "{{count}} selected",
    "selectAll": "Select all",
    "deleteSelected": "Delete selected",
    "deleteAll": "Delete all",
    "confirmDeleteTitle": "Confirm deletion",
    "confirmDeleteBatch": "Delete {{count}} tracks?",
    "confirmDeleteAll": "This will delete ALL {{count}} tracks in your library. Are you sure?",
    "deletingInProgress": "Deleting in progress..."
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx frontend/src/styles/index.css
git commit -m "feat: add search, batch delete, and selection UI to library"
```

---

### Task 6: Backend tests — verify cascade and search integration

**Files:**
- Modify: `backend/tests/test_music_routes.py`

- [ ] **Step 1: Write cascade test**

```python
def test_batch_delete_cascades_to_recommendations(client, db_session, auth_headers):
    from app.models.music import Music
    from app.models.recommendation import Recommendation
    from app.models.user import User
    user = db_session.query(User).first()
    uid = user.id
    t = Music(title="Cascade test", user_id=uid, file_path="/dev/null/c.mp3")
    db_session.add(t)
    db_session.commit()
    r = Recommendation(user_id=uid, source_music_id=t.id, target_music_id=t.id, algorithm="test", score=1.0)
    db_session.add(r)
    db_session.commit()

    resp = client.post("/api/music/batch-delete", json={"ids": [t.id]}, headers=auth_headers)
    assert resp.status_code == 200

    recs = db_session.query(Recommendation).filter(Recommendation.source_music_id == t.id).all()
    assert len(recs) == 0
```

- [ ] **Step 2: Run all music tests**

Run: `cd backend && pytest tests/test_music_routes.py -v`
Expected: All PASS

- [ ] **Step 3: Run full test suite**

Run: `cd backend && pytest -q`
Expected: All tests pass (including existing 218+)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_music_routes.py
git commit -m "test: add cascade and search integration tests"
```