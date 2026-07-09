# Library Management — Batch Delete, Search, Modal

**Date:** 2026-07-09
**Status:** Approved design

## Overview

Add batch delete (selected tracks + delete all), search by title/artist/album, and a reusable Modal component to the music library dashboard.

---

## 1. Backend — New Endpoints

### 1.1 `GET /api/music/user/{user_id}?q=string`

Add optional query param `q`. When present, filter `Music` rows with:

```sql
WHERE user_id = :uid
  AND (title ILIKE :q OR artist ILIKE :q OR album ILIKE :q)
```

where `:q = f"%{q}%"`. Pagination (LIMIT/OFFSET) unchanged. Return same `list[MusicResponse]`.

**File:** `backend/app/routes/music.py` — modify `get_user_music` (~line 204).

### 1.2 `POST /api/music/batch-delete`

Request body:

```json
{ "ids": [1, 2, 3] }
// OR
{ "delete_all": true }
```

Logic (bulk delete — avoid N+1):

1. Load `current_user` (auth required).
2. If `delete_all` → query all `Music` rows for this user.
3. If `ids` → query `Music` where `id IN (:ids)` AND `user_id = :uid`.
4. Collect all `file_path` values in a Python list (one query, no N+1).
5. Bulk-delete all matched rows with a single `DELETE FROM music WHERE id IN (:ids)` — relies on `ON DELETE CASCADE` for child tables (`Recommendation`, `AlgorithmEvent`, `AudioFeatures` all have `ondelete="CASCADE"`).
6. `db.commit()`.
7. Iterate collected `file_path` values and call `os.remove` for each. If a file is already missing, skip gracefully (`FileNotFoundError` → `pass`). DB remains consistent either way.
8. Return `{ "deleted": N }`.

**File:** `backend/app/routes/music.py` — new route at `POST /api/music/batch-delete`.

**Pydantic schema** — add to `backend/app/schemas/music.py`:

```python
class BatchDeleteRequest(BaseModel):
    ids: list[int] = Field(default_factory=list)
    delete_all: bool = False
```

---

## 2. Frontend — Components

### 2.1 `Modal.jsx` — Reusable Modal

**File:** `frontend/src/components/Modal.jsx`

Props:
- `isOpen: bool`
- `onClose: () => void`
- `title: string`
- `children: ReactNode`
- `footer?: ReactNode`

Behavior:
- Dark overlay (`position: fixed; inset: 0; background: rgba(0,0,0,0.5)`).
- Click on overlay closes.
- Centered white card with title bar, scrollable body, optional footer.
- `useEffect` + `keyboard` event listener for Escape key to close.
- **Scroll lock:** When modal is open, `document.body.style.overflow = 'hidden'`; restored on close/unmount.
- **Focus trap (basic):** On open, auto-focus the first interactive element (Cancel or Delete button) so user can confirm with Enter.
- CSS in `frontend/src/styles/index.css` under `.modal-*` classes.

### 2.2 `DashboardPage` — updated

**State additions:**
- `selectedIds: Set<number>` (which tracks are checked)
- `searchQuery: string`
- `confirmDeleteIds: number[] | "all" | null` (controls modal open + what to delete)
- `deleting: boolean` (spinner during batch delete)

**Search bar** — above the library grid:
- `<input type="search" placeholder="Search by title, artist, album..." />`
- Debounce 300ms before calling API with `?q=...`
- API call: `musicAPI.getUserMusic(userId, searchQuery)`
- **Search resets pagination:** When `searchQuery` changes, `currentPage` / `offset` resets to 1 / 0. Without this, a search while on page 5 would request `offset=100` and return empty.

**Track card checkbox** — each `.track-card` gets:
- A small checkbox in the top-left corner
- On change: add/remove from `selectedIds`
- If card is in `selectedIds` → visual highlight (border glow / background)

**SelectionBar** — appears when `selectedIds.size > 0`:
- Fixed bar at bottom of viewport
- Shows: `"N selected"` + checkbox "Select all" + "Delete selected" (btn--danger)
- "Delete selected" opens Modal with confirm text
- In Modal: "Are you sure you want to delete N tracks?" + Cancel / Delete buttons

**Select all** — in SelectionBar, a "Select all N" checkbox:
- Checks all currently loaded tracks
- **"Select all from library"** link/button that calls `delete_all: true` flow

**Batch delete flow:**
1. User selects tracks → clicks "Delete selected"
2. Modal opens: "Delete N tracks?" with Cancel / Delete buttons
3. On confirm: `musicAPI.batchDelete(Array.from(selectedIds))`
4. On success: `setSelectedIds(new Set())`, refetch tracks.
   - **Edge case:** If the number of deleted tracks equals the number of tracks on the current page, decrement the page (`setPage(p => Math.max(1, p - 1))`) before refetch to avoid an empty page.
5. On error: show alert

**Delete all flow:**
1. User clicks "Delete all" (in SelectionBar or in header)
2. Modal opens: "This will delete ALL tracks in your library. Are you sure?"
3. On confirm: `musicAPI.batchDelete({ delete_all: true })`
4. Same success/error handling

### 2.3 `api.js` — new methods

Add to `musicAPI`:

```javascript
deleteBatch(ids) {
  return api.post('/music/batch-delete', { ids }).then(r => r.data);
},

deleteAll() {
  return api.post('/music/batch-delete', { delete_all: true }).then(r => r.data);
},

getUserMusic(userId, q = '') {
  const params = q ? { q } : {};
  return api.get(`/music/user/${userId}`, { params }).then(r => r.data);
}
```

---

## 3. Error Handling

- **Backend:** `batch-delete` returns 400 if `ids` is empty and `delete_all` is `False`, or if user has no tracks.
- **Frontend:** Modal shows error message inline (red text) if API call fails. Modal stays open so user can retry.

---

## 4. Testing

- **Backend tests:** `test_music_routes.py`
  - `test_batch_delete_removes_selected_tracks` — upload 3 tracks, delete 2, assert 1 remains.
  - `test_batch_delete_all_removes_all` — upload 3, `delete_all`, assert 0 remain.
  - `test_search_filters_by_title` — upload tracks with different titles, search, assert only matching returned.
  - `test_search_filters_by_artist` — same for artist field.
  - `test_delete_other_user_id_rejected` — batch delete with other user's tracks returns 404.

- **Frontend:** Manual verification (project uses no frontend test framework).

---

## 5. CSS / Styling

New classes in `frontend/src/styles/index.css`:
- `.modal-overlay`, `.modal-card`, `.modal-header`, `.modal-body`, `.modal-footer`
- `.selection-bar`, `.selection-bar__count`, `.selection-bar__actions`
- `.track-card--selected` (highlighted state)
- `.track-card__checkbox`
- `.search-bar`

Follow existing design patterns (colors, borders, border-radius from `--primary`, `--danger`, etc.).