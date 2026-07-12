# Track Cover Art — Design Spec

**Date:** 2026-07-12
**Status:** Approved
**Scope:** Database, backend (Spotify + AI auto-fill), frontend (Dashboard, Analyze, Recommendations, GlobalPlayer, Upload)

## 1. Problem

Tracks have no cover art. The Library, Analyze page, Recommendations cards, and the Global Player all render a static `MusicNotes` icon. Spotify's API already returns `album.images[0].url`, and the backend's `_summarize_track` already extracts it into a key called `image_url` — but it is never persisted to the `Music` row, so it's lost between search and display.

## 2. Field-naming contract (resolves a pre-existing mismatch)

Two distinct concepts that today share the name `image_url`:

| Concept | Field name | Where it lives |
|---|---|---|
| Spotify search-response payload (ephemeral API contract) | `image_url` | `SpotifyClient._summarize_track`, `SpotifySearchResult` schema — unchanged |
| Persisted column on a `Music` row (DB contract) | `cover_url` | New column, read by all Music-row consumers |

**Mapping** happens only at the route layer, when a `Music` row is created: `cover_url=track.get("image_url")`.

**Pre-existing frontend reads of `image_url` that actually target a Music row** (not a Spotify search result) must be migrated to `cover_url`:
- `frontend/src/pages/RecommendationsPage.jsx:283` — `const coverUrl = m.image_url` where `m = rec.recommended_music` (a Music row) → change to `m.cover_url`.
- `frontend/src/pages/UploadPage.jsx:280` — `src={track.image_url}` on an uploaded track → change to `track.cover_url`.

## 3. Backend

### 3.1 Model & migration
- `app/models/music.py`: add `cover_url = Column(String(512), nullable=True)` immediately after `stream_url` (line ~59).
- New migration `alembic/versions/013_add_cover_url.py`: `revision="013"`, `down_revision="012"`. Uses `batch_alter_table("music")` + `add_column` (the pattern from migration `010`, which works on both Postgres and SQLite). No `server_default` (nullable). Hand-authored in the exact style `alembic revision --autogenerate` emits — autogenerate requires a live Postgres at `db:5432` unavailable in this dev env, and the hand-written result matches project convention.

### 3.2 Schema
- `app/schemas/music.py` `MusicResponse`: add `cover_url: Optional[str] = None` near `preview_url`/`stream_url`. `Config.from_attributes = True` means the ORM column flows through automatically.
- **Not** added to `MusicUpdate` — cover art is sourced from Spotify/AI, not user-edited.

### 3.3 Spotify integration
- `app/routes/spotify.py` `/spotify/add` (line ~261): add `cover_url=track.get("image_url")` to the `Music(...)` constructor. The `track` dict already carries `image_url` from `get_track` → `_summarize_track` → `_first_image`. Zero new API calls.
- `app/services/spotify.py`: unchanged (already extracts the image).

### 3.4 AI auto-fill (local tracks)
- `app/routes/music.py` `/auto-tag` (line ~324): the route already does a best-effort Spotify search to link the catalog track. Add `metadata["cover_url"] = top.get("image_url")` so the upload form receives a cover URL.
- `app/routes/music.py` `/upload` (line ~34): add `cover_url: Optional[str] = Form(None)` form param; pass `cover_url=cover_url` into the `Music(...)` constructor.
- `app/services/ai_tagger.py`: **unchanged**. Gemini is not asked for image URLs (it hallucinates them). If Spotify is disabled or finds nothing, `cover_url` is `null` → frontend shows the minimalist placeholder.

## 4. Frontend

### 4.1 Shared `CoverArt` component
- New file `frontend/src/components/CoverArt.jsx`.
- Props: `src`, `alt`, `className` (wrapper), `fallback` (icon node, defaults to `MusicNotes`).
- Renders `<img>` with `object-cover` + `onError` that hides the broken image so the placeholder shows through.
- Wrapper uses existing design tokens: `bg-secondary text-secondary-foreground`, with `overflow-hidden` and rounded corners matching the call site's tile size.
- Canonical pattern lifted from `RecommendationsPage.jsx:294-306` (the one place cover art already works).

### 4.2 Wiring
- **DashboardPage.jsx:63-65** — replace inner `<MusicNotes>` with `<CoverArt src={track.cover_url} />`; add `overflow-hidden` to the `h-11 w-11` wrapper.
- **AnalyzePage.jsx:223-225** — same, on the `h-14 w-14` tile.
- **RecommendationsPage.jsx:283** — change `m.image_url` → `m.cover_url`; replace the inline render block (294-306) with `<CoverArt src={coverUrl} />`.
- **GlobalPlayer.jsx:223-225** — add `<CoverArt src={currentTrack.coverUrl} />` to the `h-10 w-10` tile, with `overflow-hidden`; the Spotify-logo icon remains as the `fallback` prop when track is Spotify-source.
- **PlayerContext.jsx:56-68** — add `coverUrl: track.cover_url || track.image_url || null,` to the `next` allowlist (otherwise the player never sees it). CamelCase `coverUrl` matches the sibling `spotifyUrl`/`previewUrl` fields.
- **UploadPage.jsx:280** — change `track.image_url` → `track.cover_url`; ensure `cover_url` is forwarded from the auto-tag response into the upload form data.
- **`services/api.js`** — no change (pure pass-through; `cover_url` flows automatically).

## 5. Testing & verification
- Backend tests (TDD): `test_music_response_includes_cover_url`, `test_spotify_add_persists_cover_url` (mock Spotify client), `test_auto_tag_returns_cover_url` (mock Spotify client). Run `cd backend && pytest -q` (all must pass) + `ruff check app/`.
- Run `cd frontend && npm run build` to confirm the Vite build is green.
- Update `STATE.md` Module Status table (AGENTS.md §6).

## 6. Out of scope (YAGNI)
- `cover_url` on `MusicUpdate` (not user-editable).
- Spotify Web Playback live cover-art sync for currently-playing remote tracks — `currentTrack.coverUrl` comes from the Music row, which already has it for Spotify-added tracks.
- Image caching/proxying — the frontend loads the Spotify CDN URL directly (matches the existing `RecommendationsPage` pattern).
- Local-file embedded artwork extraction (e.g. mutagen ID3 APIC) — future work, tracked in STATE.md §11.
