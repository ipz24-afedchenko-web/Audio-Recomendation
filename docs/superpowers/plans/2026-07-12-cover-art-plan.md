# Track Cover Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a `cover_url` on every `Music` row (sourced from Spotify for both catalog tracks and auto-tagged local uploads), and render it across the Library, Analyze, Recommendations, and Global Player UI via a shared `CoverArt` component.

**Architecture:** New nullable `cover_url` column on `Music` (+ Alembic migration `013`). The Spotify `/add` route and the `/auto-tag` → `/upload` flow both write `cover_url` from the existing `image_url` field that `SpotifyClient._summarize_track` already extracts from `album.images[0].url`. `MusicResponse` exposes the column. A new `CoverArt` React component (img + onError fallback) is wired into four pages + the player; `PlayerContext` adds `coverUrl` to its `currentTrack` allowlist.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, React 18, JavaScript (no TS), Tailwind v4 + shadcn tokens, Axios

## Global Constraints

- **Field naming (critical):** `image_url` = ephemeral field on Spotify search payloads (the `SpotifySearchResult` schema + `_summarize_track` dict). `cover_url` = persisted column on a `Music` row. The two are mapped at the route layer only (`cover_url=track.get("image_url")`). Never rename `image_url` on the Spotify search payload.
- **Pydantic v2** (`from pydantic import BaseModel`). `MusicResponse` already has `Config.from_attributes = True`, so adding the field is enough — no mapper code.
- **No `print()`** — use `logger = logging.getLogger(__name__)`.
- **Auth:** every mutation checks `music.user_id == current_user.id` (existing routes already do; we add no new mutation routes).
- **Migration style:** `batch_alter_table` (works on Postgres + SQLite), matching migration `010`. No `server_default` (column is nullable).
- **Frontend:** `.jsx`/`.js` only, no TypeScript. Tailwind utilities + existing design tokens (`bg-secondary text-secondary-foreground`). No new npm packages.
- **TDD:** backend tests written first, then implementation. Frontend verified via `npm run build`.
- **`ai_tagger.py` is unchanged** — Gemini is never asked for image URLs (it hallucinates them). Cover sourcing for local uploads goes through the existing best-effort Spotify search in `/auto-tag`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/app/models/music.py` | Modify | Add `cover_url` column |
| `backend/alembic/versions/013_add_cover_url.py` | Create | Migration: add nullable column |
| `backend/app/schemas/music.py` | Modify | Expose `cover_url` on `MusicResponse` |
| `backend/app/routes/spotify.py` | Modify | Persist `cover_url` when adding a Spotify track |
| `backend/app/routes/music.py` | Modify | `/auto-tag` returns `cover_url`; `/upload` accepts + persists it |
| `backend/tests/test_spotify.py` | Modify | Assert `/spotify/add` persists `cover_url` |
| `backend/tests/test_music_routes.py` | Modify | Assert `/upload` persists `cover_url`; `/auto-tag` returns it |
| `frontend/src/components/CoverArt.jsx` | Create | Shared img + minimalist fallback component |
| `frontend/src/pages/DashboardPage.jsx` | Modify | Render `CoverArt` on track cards |
| `frontend/src/pages/AnalyzePage.jsx` | Modify | Render `CoverArt` in track info block |
| `frontend/src/pages/RecommendationsPage.jsx` | Modify | Read `cover_url` (was `image_url`); use `CoverArt` |
| `frontend/src/pages/UploadPage.jsx` | Modify | Forward `cover_url` from auto-tag into upload form |
| `frontend/src/context/PlayerContext.jsx` | Modify | Add `coverUrl` to `currentTrack` allowlist |
| `frontend/src/components/GlobalPlayer.jsx` | Modify | Render `CoverArt` thumbnail |
| `STATE.md` | Modify | Update Module Status table |

---

### Task 1: Backend — Add `cover_url` column to `Music` model

**Files:**
- Modify: `backend/app/models/music.py:59` (the external-catalog URL block)

**Interfaces:**
- Consumes: nothing
- Produces: `Music.cover_url` (`String(512)`, nullable) — relied on by Tasks 2–5 and the schema in Task 3

- [ ] **Step 1: Add the column**

In `backend/app/models/music.py`, the external-catalog URL block is currently (lines 55–59):

```python
    # External catalog identifiers (NULL for ``source='local'``).
    external_id = Column(String(128), nullable=True)   # Spotify track id
    external_uri = Column(String(256), nullable=True)   # spotify:track:xxxx
    preview_url = Column(String(512), nullable=True)    # 30s iframe src
    stream_url = Column(String(512), nullable=True)    # direct audio (future)
```

Add `cover_url` immediately after `stream_url`:

```python
    # External catalog identifiers (NULL for ``source='local'``).
    external_id = Column(String(128), nullable=True)   # Spotify track id
    external_uri = Column(String(256), nullable=True)   # spotify:track:xxxx
    preview_url = Column(String(512), nullable=True)    # 30s iframe src
    stream_url = Column(String(512), nullable=True)    # direct audio (future)
    cover_url = Column(String(512), nullable=True)    # album/cover art URL
```

- [ ] **Step 2: Verify the column is visible on the ORM model**

Run:
```bash
cd backend && python -c "from app.models.music import Music; assert 'cover_url' in Music.__table__.columns; print('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/music.py
git commit -m "feat(model): add cover_url column to Music"
```

---

### Task 2: Backend — Alembic migration `013_add_cover_url`

**Files:**
- Create: `backend/alembic/versions/013_add_cover_url.py`

**Interfaces:**
- Consumes: `Music.cover_url` from Task 1
- Produces: `cover_url` column in the live DB schema (Postgres prod / SQLite tests via `Base.metadata.create_all`)

**Note:** `alembic revision --autogenerate` requires a live Postgres at `db:5432` (per `alembic.ini` line 61), unavailable in this dev env. We hand-author the migration in the exact style migration `010` uses for adding nullable columns — byte-equivalent to what autogenerate emits.

- [ ] **Step 1: Write the migration**

Create `backend/alembic/versions/013_add_cover_url.py`:

```python
"""Add cover_url to music for track cover art

Revision ID: 013
Revises: 012
Create Date: 2026-07-12 12:00:00.000000

Adds a nullable ``cover_url`` column to ``music`` so each track can
carry an album/cover-art URL.  Populated by:

- ``POST /api/spotify/add`` (from ``album.images[0].url``)
- ``POST /api/music/upload`` (from the ``/auto-tag`` Spotify lookup)

NULL for tracks where no cover was found — the frontend renders a
minimalist placeholder in that case.
"""

from alembic import op
import sqlalchemy as sa


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("cover_url", sa.String(length=512), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("music", schema=None) as batch_op:
        batch_op.drop_column("cover_url")
```

- [ ] **Step 2: Verify the revision chain**

Run:
```bash
cd backend && python -c "import importlib.util,os; p=os.path.join('alembic','versions','013_add_cover_url.py'); s=importlib.util.spec_from_file_location('m013',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert m.revision=='013' and m.down_revision=='012'; print('chain ok')"
```
Expected output: `chain ok`

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/013_add_cover_url.py
git commit -m "feat(db): migration 013 add cover_url to music"
```

---

### Task 3: Backend — Expose `cover_url` on `MusicResponse`

**Files:**
- Modify: `backend/app/schemas/music.py:51` (after `stream_url`)

**Interfaces:**
- Consumes: `Music.cover_url` from Task 1
- Produces: `cover_url` field on every `MusicResponse` / `MusicWithFeatures` JSON payload (they inherit). Relied on by all frontend tasks.

- [ ] **Step 1: Add the field**

In `backend/app/schemas/music.py`, the `MusicResponse` provenance block is (lines 47–51):

```python
    source: Source = "local"
    external_id: Optional[str] = None
    external_uri: Optional[str] = None
    preview_url: Optional[str] = None
    stream_url: Optional[str] = None
```

Add `cover_url` after `stream_url`:

```python
    source: Source = "local"
    external_id: Optional[str] = None
    external_uri: Optional[str] = None
    preview_url: Optional[str] = None
    stream_url: Optional[str] = None
    cover_url: Optional[str] = None
```

**Do NOT** add it to `MusicUpdate` (cover art is sourced from Spotify/AI, not user-edited).

- [ ] **Step 2: Verify the schema carries the field**

Run:
```bash
cd backend && python -c "from app.schemas.music import MusicResponse; assert 'cover_url' in MusicResponse.model_fields; print('ok')"
```
Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/music.py
git commit -m "feat(schema): expose cover_url on MusicResponse"
```

---

### Task 4: Backend — Persist `cover_url` in `/spotify/add`

**Files:**
- Modify: `backend/app/routes/spotify.py:261-272` (the `Music(...)` constructor in `add_spotify_track`)

**Interfaces:**
- Consumes: `track["image_url"]` (already produced by `SpotifyClient.get_track` → `_summarize_track` → `_first_image`, which reads `album.images[0].url`)
- Produces: persisted `Music.cover_url` for Spotify-added tracks

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_spotify.py` (after `test_add_spotify_creates_ready_track`, ~line 126):

```python
def test_add_spotify_persists_cover_url(
    client: TestClient, auth_headers: dict, spotify_client_mock
):
    """The /add route must persist album.images[0].url as cover_url."""
    with patch("app.routes.spotify.settings") as mock_settings:
        mock_settings.spotify_enabled = True
        r = client.post(
            "/api/spotify/add",
            json={"spotify_track_id": "abc123"},
            headers=auth_headers,
        )
    assert r.status_code == 201, r.text
    body = r.json()
    # _fake_track() carries image_url="https://i.scdn.co/image/x"
    assert body["cover_url"] == "https://i.scdn.co/image/x"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd backend && pytest tests/test_spotify.py::test_add_spotify_persists_cover_url -v
```
Expected: FAIL — `AssertionError: assert None == 'https://i.scdn.co/image/x'` (the column exists but the route doesn't populate it).

- [ ] **Step 3: Implement — pass `cover_url` into the `Music(...)` constructor**

In `backend/app/routes/spotify.py`, the constructor block (lines 261–272) is:

```python
    db_music = Music(
        title=track.get("title") or "Unknown",
        artist=track.get("artist"),
        album=track.get("album"),
        duration=(track.get("duration_ms") or 0) / 1000.0,
        source=SOURCE_SPOTIFY,
        external_id=track_id,
        external_uri=track.get("external_uri"),
        preview_url=preview_url,
        analysis_status="analyzing",
        user_id=current_user.id,
    )
```

Add the `cover_url` line (after `preview_url=preview_url,`):

```python
    db_music = Music(
        title=track.get("title") or "Unknown",
        artist=track.get("artist"),
        album=track.get("album"),
        duration=(track.get("duration_ms") or 0) / 1000.0,
        source=SOURCE_SPOTIFY,
        external_id=track_id,
        external_uri=track.get("external_uri"),
        preview_url=preview_url,
        cover_url=track.get("image_url"),
        analysis_status="analyzing",
        user_id=current_user.id,
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd backend && pytest tests/test_spotify.py::test_add_spotify_persists_cover_url -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/spotify.py backend/tests/test_spotify.py
git commit -m "feat(spotify): persist cover_url on /add"
```

---

### Task 5: Backend — `/auto-tag` returns `cover_url`; `/upload` accepts + persists it

**Files:**
- Modify: `backend/app/routes/music.py:34-50` (`upload_music` signature + constructor)
- Modify: `backend/app/routes/music.py:324-339` (the Spotify-search block in `auto_tag_file`)

**Interfaces:**
- Consumes: `top["image_url"]` from the existing `client.search(...)` call in `/auto-tag`
- Produces: `metadata["cover_url"]` on the `/auto-tag` response; `Music.cover_url` populated for local uploads when the frontend forwards it

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_music_routes.py` (append at end of file):

```python
def test_auto_tag_returns_cover_url_from_spotify(client, auth_headers):
    """/auto-tag must surface image_url from the Spotify search as cover_url."""
    from unittest.mock import patch

    fake_track = {
        "spotify_track_id": "xyz",
        "title": "Song",
        "artist": "Art",
        "external_uri": "spotify:track:xyz",
        "image_url": "https://i.scdn.co/image/cover",
    }
    with patch("app.routes.music.get_ai_tagger") as mock_tagger, \
         patch("app.services.spotify.get_spotify_client") as mock_spotify, \
         patch("app.routes.music.get_settings") as mock_settings:
        mock_tagger.return_value.auto_tag.return_value = {
            "artist": "Art", "title": "Song", "genre": None, "album": None, "year": None,
        }
        mock_spotify.return_value.search.return_value = [fake_track]
        mock_settings.return_value.spotify_enabled = True
        r = client.post(
            "/api/music/auto-tag",
            data={"filename": "Art - Song.mp3"},
            headers=auth_headers,
        )
    assert r.status_code == 200, r.text
    meta = r.json()["metadata"]
    assert meta["cover_url"] == "https://i.scdn.co/image/cover"


def test_upload_persists_cover_url(client, auth_headers, uploads_dir):
    """/upload must persist a forwarded cover_url on the Music row."""
    r = _upload(client, auth_headers, title="With Cover")
    # _upload doesn't send cover_url; patch it in via a direct call.
    assert r.status_code == 201  # baseline still works without cover_url

    # Now send cover_url explicitly.
    content = _make_mp3_bytes(b"\x01" * 64)  # different bytes => different hash
    files = {"file": ("with_cover.mp3", io.BytesIO(content), "audio/mpeg")}
    data = {"title": "Covered", "cover_url": "https://i.scdn.co/image/c"}
    r2 = client.post(
        "/api/music/upload", files=files, data=data, headers=auth_headers
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["cover_url"] == "https://i.scdn.co/image/c"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd backend && pytest tests/test_music_routes.py::test_auto_tag_returns_cover_url_from_spotify tests/test_music_routes.py::test_upload_persists_cover_url -v
```
Expected: FAIL — `KeyError: 'cover_url'` on the auto-tag test; the upload test fails with `assert None == 'https://i.scdn.co/image/c'`.

- [ ] **Step 3: Implement `/auto-tag` — surface `cover_url`**

In `backend/app/routes/music.py`, the Spotify-search block in `auto_tag_file` (lines 334–337) is:

```python
                    if results:
                        top = results[0]
                        metadata["spotify_track_id"] = top.get("spotify_track_id")
                        metadata["external_uri"] = top.get("external_uri")
```

Add the `cover_url` line:

```python
                    if results:
                        top = results[0]
                        metadata["spotify_track_id"] = top.get("spotify_track_id")
                        metadata["external_uri"] = top.get("external_uri")
                        metadata["cover_url"] = top.get("image_url")
```

- [ ] **Step 4: Implement `/upload` — accept + persist `cover_url`**

In `backend/app/routes/music.py`, the `upload_music` signature (lines 39–49) currently ends its Form params at:

```python
    external_id: str = Form(None),
    external_uri: str = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
```

Add `cover_url` after `external_uri`:

```python
    external_id: str = Form(None),
    external_uri: str = Form(None),
    cover_url: str = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
```

Then in the `Music(...)` constructor (lines 123–135):

```python
    db_music = Music(
        title=title,
        artist=artist,
        album=album,
        genre=genre,
        external_id=external_id or None,
        external_uri=external_uri or None,
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        analysis_status=ANALYSIS_STATUS_PENDING,
        user_id=current_user.id,
    )
```

Add `cover_url=cover_url or None,` (after `external_uri=external_uri or None,`):

```python
    db_music = Music(
        title=title,
        artist=artist,
        album=album,
        genre=genre,
        external_id=external_id or None,
        external_uri=external_uri or None,
        cover_url=cover_url or None,
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        analysis_status=ANALYSIS_STATUS_PENDING,
        user_id=current_user.id,
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
cd backend && pytest tests/test_music_routes.py::test_auto_tag_returns_cover_url_from_spotify tests/test_music_routes.py::test_upload_persists_cover_url -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/routes/music.py backend/tests/test_music_routes.py
git commit -m "feat(music): auto-tag returns cover_url; upload persists it"
```

---

### Task 6: Backend — Full suite + lint

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite**

Run:
```bash
cd backend && pytest -q
```
Expected: all tests pass (the suite was 176 tests; we added 3, so ~179). No regressions.

- [ ] **Step 2: Run ruff**

Run:
```bash
cd backend && ruff check app/
```
Expected: no errors.

- [ ] **Step 3: If anything fails, fix and re-run. Do not commit broken.**

---

### Task 7: Frontend — `CoverArt` component

**Files:**
- Create: `frontend/src/components/CoverArt.jsx`

**Interfaces:**
- Consumes: a `src` URL string (or null), plus optional `className` + `fallback`
- Produces: a self-contained tile used by Tasks 8–11

- [ ] **Step 1: Write the component**

Create `frontend/src/components/CoverArt.jsx`:

```jsx
import { useState } from "react";
import { MusicNotes } from "@phosphor-icons/react";

/**
 * CoverArt — renders a track's cover image with a minimalist fallback.
 *
 * - When `src` is present and loads, shows the image (object-cover).
 * - When `src` is missing OR the image fails to load, shows the `fallback`
 *   node (default: a subtle MusicNotes icon on the secondary surface).
 *
 * The wrapper sizing/rounding is controlled by the caller via `className`
 * (e.g. "h-11 w-11 rounded-lg"). This component only owns the inner
 * image-vs-placeholder logic + the overflow-hidden clipping.
 *
 * @param {string|null|undefined} src      Cover image URL.
 * @param {string}                alt      Alt text (defaults to "").
 * @param {string}                className Tailwind classes for the wrapper tile.
 * @param {React.ReactNode}       fallback Optional custom fallback node.
 */
export default function CoverArt({
  src,
  alt = "",
  className = "h-11 w-11 rounded-lg",
  fallback = null,
}) {
  const [broken, setBroken] = useState(false);
  const showImg = src && !broken;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-secondary text-secondary-foreground ${className}`}
    >
      {showImg ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        fallback ?? <MusicNotes className="h-1/2 w-1/2" weight="fill" />
      )}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CoverArt.jsx
git commit -m "feat(frontend): add CoverArt component"
```

---

### Task 8: Frontend — DashboardPage track cards

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx:1-22` (imports) and `:63-65` (the tile)

**Interfaces:**
- Consumes: `CoverArt` from Task 7; `track.cover_url` from the backend
- Produces: cover art on every Library card

- [ ] **Step 1: Add the import**

In `frontend/src/pages/DashboardPage.jsx`, the import block ends with (line 33):

```jsx
import StatusBadge from "../components/StatusBadge";
```

Add after it:

```jsx
import StatusBadge from "../components/StatusBadge";
import CoverArt from "../components/CoverArt";
```

- [ ] **Step 2: Replace the music-note tile**

The tile in `TrackCard` (lines 63–65) is:

```jsx
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <MusicNotes className="h-5 w-5" weight="fill" />
        </span>
```

Replace with:

```jsx
        <CoverArt src={track.cover_url} className="h-11 w-11 rounded-lg" />
```

- [ ] **Step 3: Verify `MusicNotes` is still used elsewhere in the file before deciding to drop the import**

Run:
```bash
cd frontend && grep -n "MusicNotes" src/pages/DashboardPage.jsx
```
If the only remaining references are in the big empty-state block (around line 287–289, the `h-14 w-14` illustration) — keep the `MusicNotes` import (it's still used there). Do not remove it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat(frontend): render cover art on dashboard track cards"
```

---

### Task 9: Frontend — AnalyzePage track info block

**Files:**
- Modify: `frontend/src/pages/AnalyzePage.jsx` (imports + the `h-14 w-14` tile at ~lines 223–225)

**Interfaces:**
- Consumes: `CoverArt` from Task 7; `track.cover_url` from the backend
- Produces: cover art next to the track title on the Analyze page

- [ ] **Step 1: Add the import**

Find the existing `StatusBadge` import in `frontend/src/pages/AnalyzePage.jsx` and add `CoverArt` next to it. (Read the file's import block first to match the exact line; the import is something like `import StatusBadge from "../components/StatusBadge";`.)

Add:

```jsx
import CoverArt from "../components/CoverArt";
```

- [ ] **Step 2: Replace the music-note tile**

The tile (lines 223–225) is:

```jsx
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <MusicNotes className="h-7 w-7" weight="fill" />
          </span>
```

Replace with:

```jsx
          <CoverArt src={track.cover_url} className="h-14 w-14 rounded-2xl" />
```

- [ ] **Step 3: Check whether `MusicNotes` is still used in AnalyzePage**

Run:
```bash
cd frontend && grep -n "MusicNotes" src/pages/AnalyzePage.jsx
```
If no other references remain, remove `MusicNotes` from the `@phosphor-icons/react` import. If references remain, leave the import.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AnalyzePage.jsx
git commit -m "feat(frontend): render cover art on analyze page"
```

---

### Task 10: Frontend — RecommendationsPage (fix field name + use `CoverArt`)

**Files:**
- Modify: `frontend/src/pages/RecommendationsPage.jsx:283` (field name) and `:294-306` (the inline render block)

**Interfaces:**
- Consumes: `CoverArt` from Task 7; `m.cover_url` (was `m.image_url`) — `m = rec.recommended_music` is a Music row
- Produces: cover art on recommendation cards reading the correct persisted field

- [ ] **Step 1: Add the import**

Add to the import block of `frontend/src/pages/RecommendationsPage.jsx`:

```jsx
import CoverArt from "../components/CoverArt";
```

- [ ] **Step 2: Fix the field name**

Line 283 is:

```jsx
            const coverUrl = m.image_url || null;
```

Change to:

```jsx
            const coverUrl = m.cover_url || null;
```

- [ ] **Step 3: Replace the inline render block with `CoverArt`**

Lines 294–306 are:

```jsx
                    {/* Album art placeholder */}
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground overflow-hidden">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      ) : (
                        <span className="text-lg">🎵</span>
                      )}
                    </span>
```

Replace with:

```jsx
                    <CoverArt
                      src={coverUrl}
                      className="h-11 w-11 rounded-lg"
                      fallback={<span className="text-lg">🎵</span>}
                    />
```

(The `🎵` fallback preserves the existing aesthetic on this page.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RecommendationsPage.jsx
git commit -m "feat(frontend): recommendations read cover_url via CoverArt"
```

---

### Task 11: Frontend — `PlayerContext` allowlist + GlobalPlayer thumbnail

**Files:**
- Modify: `frontend/src/context/PlayerContext.jsx:56-68` (the `next` object in `playTrack`)
- Modify: `frontend/src/components/GlobalPlayer.jsx` (imports + the `h-10 w-10` tile at ~lines 223–225)

**Interfaces:**
- Consumes: `track.cover_url` from the raw Music row; `CoverArt` from Task 7
- Produces: `currentTrack.coverUrl` available to the player

- [ ] **Step 1: Add `coverUrl` to the `currentTrack` allowlist**

In `frontend/src/context/PlayerContext.jsx`, the `next` object (lines 56–68) is:

```jsx
    const next = {
      id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      duration: track.duration || 0,
      mode: isSpotify ? 'spotify' : 'local',
      src: isSpotify ? (track.preview_url || null) : streamUrl(id),
      spotifyUri: track.spotify_track_id || track.spotifyTrackId || track.external_id || null,
      spotifyUrl: track.spotify_url || track.external_url || null,
      previewUrl: track.preview_url || null,
    };
```

Add the `coverUrl` line (after `previewUrl`):

```jsx
    const next = {
      id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      duration: track.duration || 0,
      mode: isSpotify ? 'spotify' : 'local',
      src: isSpotify ? (track.preview_url || null) : streamUrl(id),
      spotifyUri: track.spotify_track_id || track.spotifyTrackId || track.external_id || null,
      spotifyUrl: track.spotify_url || track.external_url || null,
      previewUrl: track.preview_url || null,
      coverUrl: track.cover_url || track.image_url || null,
    };
```

(The `track.image_url` fallback is defensive — the player sometimes receives raw Spotify search results which use `image_url`.)

- [ ] **Step 2: Add the `CoverArt` import to GlobalPlayer**

In `frontend/src/components/GlobalPlayer.jsx`, add to the imports:

```jsx
import CoverArt from "./CoverArt";
```

- [ ] **Step 3: Replace the player tile**

The tile (lines 223–225) is:

```jsx
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              {isSpotify ? <SpotifyLogo className="h-5 w-5" /> : <MusicNote className="h-5 w-5" />}
            </span>
```

Replace with:

```jsx
            <CoverArt
              src={currentTrack?.coverUrl}
              className="h-10 w-10 rounded-lg"
              fallback={isSpotify ? <SpotifyLogo className="h-5 w-5" /> : <MusicNote className="h-5 w-5" />}
            />
```

- [ ] **Step 4: Check whether `MusicNote` / `SpotifyLogo` are still used in GlobalPlayer**

Run:
```bash
cd frontend && grep -n "MusicNote\|SpotifyLogo" src/components/GlobalPlayer.jsx
```
Both are still used as the `fallback` above — keep the imports.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/PlayerContext.jsx frontend/src/components/GlobalPlayer.jsx
git commit -m "feat(frontend): cover art thumbnail in global player"
```

---

### Task 12: Frontend — UploadPage forwards `cover_url` from auto-tag

**Files:**
- Modify: `frontend/src/pages/UploadPage.jsx:79` (the `form` state), `:100-108` (`autoFill`), `:122-131` (`submit` FormData)

**Interfaces:**
- Consumes: `metadata.cover_url` from the `/auto-tag` response (Task 5)
- Produces: `cover_url` forwarded into the `/upload` FormData so the backend persists it

**Important:** Line 280 (`src={track.image_url}`) is in the `SpotifyTab`, where `track` is a **Spotify search result** — it correctly uses `image_url` (the `SpotifySearchResult` schema field). **Do NOT change line 280.** Only the `FileTab` needs editing.

- [ ] **Step 1: Add `coverUrl` to the form state**

Line 79 is:

```jsx
  const [form, setForm] = useState({ title: "", artist: "", album: "", genre: "", spotifyTrackId: "", spotifyExternalUri: "" });
```

Change to:

```jsx
  const [form, setForm] = useState({ title: "", artist: "", album: "", genre: "", spotifyTrackId: "", spotifyExternalUri: "", coverUrl: "" });
```

- [ ] **Step 2: Capture `cover_url` in `autoFill`**

The `autoFill` state update (lines 101–108) is:

```jsx
      setForm((f0) => ({
        title: d.title || f0.title,
        artist: d.artist || f0.artist,
        album: d.album || f0.album,
        genre: d.genre || f0.genre,
        spotifyTrackId: d.spotify_track_id || f0.spotifyTrackId,
        spotifyExternalUri: d.external_uri || f0.spotifyExternalUri,
      }));
```

Add the `coverUrl` line:

```jsx
      setForm((f0) => ({
        title: d.title || f0.title,
        artist: d.artist || f0.artist,
        album: d.album || f0.album,
        genre: d.genre || f0.genre,
        spotifyTrackId: d.spotify_track_id || f0.spotifyTrackId,
        spotifyExternalUri: d.external_uri || f0.spotifyExternalUri,
        coverUrl: d.cover_url || f0.coverUrl,
      }));
```

- [ ] **Step 3: Forward `cover_url` in the upload FormData**

The `submit` FormData block (lines 122–131) is:

```jsx
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("artist", form.artist);
      fd.append("album", form.album);
      fd.append("genre", form.genre);
      if (form.spotifyTrackId) {
        fd.append("external_id", form.spotifyTrackId);
        fd.append("external_uri", form.spotifyExternalUri || `spotify:track:${form.spotifyTrackId}`);
      }
```

Add the `cover_url` append after the `genre` line (before the `if`):

```jsx
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("artist", form.artist);
      fd.append("album", form.album);
      fd.append("genre", form.genre);
      if (form.coverUrl) {
        fd.append("cover_url", form.coverUrl);
      }
      if (form.spotifyTrackId) {
        fd.append("external_id", form.spotifyTrackId);
        fd.append("external_uri", form.spotifyExternalUri || `spotify:track:${form.spotifyTrackId}`);
      }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/UploadPage.jsx
git commit -m "feat(frontend): forward cover_url from auto-tag into upload"
```

---

### Task 13: Frontend — Build verification

**Files:**
- No new files

- [ ] **Step 1: Run the Vite build**

Run:
```bash
cd frontend && npm run build
```
Expected: build succeeds, no errors. (Warnings are acceptable; errors are not.)

- [ ] **Step 2: If the build fails, fix the error and re-run. Do not commit broken.**

---

### Task 14: Docs — Update `STATE.md` Module Status

**Files:**
- Modify: `STATE.md` (the "Module Status" table near the end of the file)

- [ ] **Step 1: Add a row for cover art**

Append a row to the Module Status table noting: `cover_url` column + migration `013` + `CoverArt` component shipped across Dashboard / Analyze / Recommendations / GlobalPlayer / Upload. Move any relevant item from §11 if present; otherwise just add the row.

- [ ] **Step 2: Commit**

```bash
git add STATE.md
git commit -m "docs: update STATE.md module status for cover art"
```

---

## Self-Review

**1. Spec coverage:**
- §3.1 Model + migration → Tasks 1, 2 ✓
- §3.2 Schema → Task 3 ✓
- §3.3 Spotify `/add` → Task 4 ✓
- §3.4 `/auto-tag` + `/upload` → Task 5 ✓
- §4.1 `CoverArt` component → Task 7 ✓
- §4.2 DashboardPage → Task 8 ✓
- §4.2 AnalyzePage → Task 9 ✓
- §4.2 RecommendationsPage (field name + CoverArt) → Task 10 ✓
- §4.2 GlobalPlayer + PlayerContext → Task 11 ✓
- §4.2 UploadPage (forward cover_url) → Task 12 ✓
- §5 Testing + verification → Tasks 6, 13 ✓
- STATE.md → Task 14 ✓
- Spec §6 (YAGNI) correctly excluded: no `MusicUpdate.cover_url`, no `ai_tagger.py` change, no image proxy ✓

**2. Placeholder scan:** No TBDs, no "add error handling", no "similar to Task N". Every code step shows full code. ✓

**3. Type consistency:**
- `cover_url` (snake_case) used consistently on the backend model, schema, route params, and the raw `track`/`m` objects in the frontend. ✓
- `coverUrl` (camelCase) used consistently on the `currentTrack` allowlist (`PlayerContext`) and read as `currentTrack.coverUrl` in `GlobalPlayer`. Matches the sibling `spotifyUrl`/`previewUrl` convention. ✓
- `CoverArt` props (`src`, `alt`, `className`, `fallback`) consistent across Tasks 7–11. ✓
- Migration revision chain `012 → 013` matches the head reported in exploration. ✓
- `track.get("image_url")` (Spotify search payload key) read consistently in Tasks 4 and 5. ✓

**4. Ambiguity check:** The `image_url` vs `cover_url` distinction is explicit in Global Constraints and reaffirmed in Task 12 (UploadPage line 280 stays `image_url`). ✓

No issues found.
