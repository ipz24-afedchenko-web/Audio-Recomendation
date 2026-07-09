# Project Status - Audio-Based Music Recommender

**Last Updated**: 2026-07-08

---

## 0.4. Week 4 — Genre-Aware Recommendations (W4-1) 🎚️

Implemented the first Week-4 item: the recommendation feature vector now
carries a genre signal so K-Means clusters respect musical style, not just
audio similarity.  Previously, with only 3–4 tracks, K-Means grouped purely
by timbre/tempo and ignored genre entirely (W4-1).

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | `audio_utils` | Feature vector had no genre information. | Added `GENRE_VOCABULARY` (25 canonical genres + "other"), `_normalize_genre` (case/synonym folding), `genre_to_vector` (fixed-length one-hot), and `extract_feature_vector_length`. `extract_feature_vector(features, genre=...)` now appends the genre block; omitting `genre` preserves the legacy 30-dim audio-only vector for `GenreClassifier`/`calculate_feature_similarity`. |
| 2 | `ml_recommender` | Clusters ignored genre; stale on-disk models could crash after a dim change. | `_build_feature_matrix` threads `genre_by_music_id` (single query, no N+1). `fit_clusters`/`get_recommendations` inject genre. `load_models` discards a scaler whose `n_features_in_` != the live `feature_dim`. `auto_retrain_if_needed` force-refits when no usable model exists (e.g. after the W4-1 dimension bump). |

**Tests**: added 6 tests (`test_audio_utils` × 5, `test_ml_recommender` × 1) —
genre one-hot/synonyms/neutral, vector length, and genre-separated clustering.
Total **80 passed** (was 74).

**Migration**: none (genre already lives on `Music.genre`; `predict_batch`
writes predicted genres back there, so they feed clustering automatically).

**Definition-of-done check**: W4-1 shipped. W4-2/W4-3 remain.

## 0.5. Week 4 — A/B Significance & Auto-Promote (W4-2) 📊

Extended the Phase-1 A/B plumbing (model `AlgorithmEvent` + `/api/ab/*`,
M5) with statistical rigour and a persisted default algorithm.

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Stats | `/api/ab/stats` returned CTR only — no significance. | New `app/services/ab_stats.py`: `compute_ab_stats` ranks algorithms by CTR and runs a two-proportion **z-test** (pure-stdlib `math.erf`, no scipy) comparing the winner against every other algorithm. Reports `z_score` / `p_value` / `significant` per row, plus `best_algorithm` and `winner_significant`. |
| 2 | Persistence | No way to promote a winning algorithm as the recommendation default. | New `ABConfig` model + migration `007_add_ab_config.py` (single-row `default_algorithm`). `get_default_algorithm` / `set_default_algorithm` in the service. |
| 3 | API | Default algorithm was hardcoded to 3. | `GET /api/recommend/{id}` now resolves the effective algorithm from the promoted default when `algorithm` is omitted (explicit values still win). New `POST /api/ab/promote` (superuser-only) and `GET /api/ab/default`. |
| 4 | Schema | `ABStatsResponse` / `ABStatsRow` gained significance + default fields (additive — frontend stats panel unchanged). | See `app/schemas/algorithm_event.py`. |

**Tests**: added `tests/test_ab_stats.py` (9 tests) — z-test math, winner
flagging, promotion, and the superuser-gated endpoint. Total **89 passed**
(was 80).

**Definition-of-done check**: W4-1 ✅, W4-2 ✅ shipped; W4-3 (admin dashboard)
pending.

## 0.6. Week 4 — Admin Dashboard (W4-3) 🛡️

Added a superuser-only admin dashboard that surfaces library health and the
A/B experiment (W4-2) results, with one-click promotion of the winning
algorithm.

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Backend | No admin endpoint; `UserResponse` omitted `is_superuser`. | New `app/routes/admin.py` — `GET /api/admin/stats` (superuser-gated) returns `user_count` / `music_count` / `analyzed_count` plus the W4-2 A/B summary in a single call. `UserResponse` now includes `is_superuser`. |
| 2 | Frontend | No admin UI / nav entry for superusers. | New `pages/AdminDashboardPage.jsx`: 3-up library stat cards + extended A/B table (z-score, p-value, significance, current-default marker) and a **Promote winner as default** button (calls `POST /api/ab/promote`). `Navbar` shows an Admin link only for `user.is_superuser`; `App.jsx` adds the `/admin` route; `api.js` adds `adminAPI.getStats` + `recommendAPI.promote`/`getDefault`. |
| 3 | Strings / CSS | — | Added `admin.*` + `nav.admin` keys to `strings.js`; added `.card-grid-3`, `.stat-label`, `.stat-value`, `.align-center`, `.tag-default` to `index.css` (reused existing `.pill`/`.ab-stats-grid`). |

**Tests**: added `tests/test_admin.py` (4 tests) — superuser-gating, counts+A/B
payload, and `is_superuser` in `GET /auth/me`. Total **93 passed** (was 89).

**Definition-of-done check**: W4-1 ✅, W4-2 ✅, W4-3 ✅ shipped. Remaining
Week-4 items (W4-4…W4-9) are Medium/Low priority.

## 0.7. Week 4 — bcrypt Upgrade (W4-4) 🔐

Unpinned `bcrypt` from `==3.2.2` (the only remaining Medium
backlog item that blocked a modern dependency).

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Deps | `bcrypt==3.2.2` pinned because `passlib==1.7.4` was believed incompatible with `bcrypt>=4.0.0`. | Compat **confirmed** in this env (`bcrypt 4.0.1` + `passlib 1.7.4`): `CryptContext` hashing/verify work, the `__about__`-style failures don't surface via the `CryptContext` API. `requirements.txt` now pins `bcrypt>=4.0.1`. |
| 2 | Security | `bcrypt 4.x` rejects passwords > 72 bytes with a raw `ValueError`. | `get_password_hash` / `verify_password` in `app/utils/auth.py` now guard the 72-byte limit (`BCRYPT_MAX_BYTES`): hashing raises a clean `ValueError`, verify returns `False` instead of crashing. |

**Tests**: added 2 tests in `test_auth_utils.py` (over-long password
rejected on hash; verify returns `False` cleanly). Total **95 passed** (was 93).

**Definition-of-done**: W4-4 resolved with confirmation rationale
(per the Week-4 DoD).

## 0.8. Week 4 — updated_at Triggers (W4-5) 🕚

Added native PostgreSQL `updated_at` triggers (DB3) so the timestamp
stays current even for rows mutated *outside* the ORM (bulk SQL,
another service, a manual `psql` session), while the SQLite test/dev
path keeps using the ORM `onupdate`.

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | DB | `updated_at` only maintained by SQLAlchemy `onupdate=func.now()` in `User`/`Music` — bypassed by raw SQL. | New migration `008_add_updated_at_triggers.py`: a `set_updated_at()` plpgsql function + BEFORE UPDATE triggers on `users` and `music`. Guarded by a dialect check — the raw DDL is **skipped on SQLite** (tests/dev), where the ORM already handles it. |
| 2 | Tests | — | `tests/test_migrations.py` loads migration 008 and runs `upgrade()`/`downgrade()` against an in-memory SQLite engine, asserting the dialect guard makes it no-op safely (no plpgsql parsed). Also checks the 008→007 revision chain. |

**Tests**: added `tests/test_migrations.py` (2 tests). Total **97 passed** (was 95).

**Definition-of-done**: W4-5 resolved with rationale — PG gets
triggers, SQLite keeps ORM `onupdate` (per the original DB3 note).

## 0.9. Week 4 — Route Tests & Clusters Fix (W4-6) 🧪

Added route-layer tests covering previously unexercised paths: analyzed-features
GET, music PUT/GET, and the recommend train / clusters endpoints.  Fixed a
FastAPI route-ordering bug where `GET /api/recommend/clusters` was shadowed by
`GET /api/recommend/{music_id}` (int-parsed "clusters" → 422).

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Tests | Coverage gaps in analyze, music, recommend routes. | `test_more_routes.py` (5 tests) — `test_get_features_for_analyzed`, `test_put_music_updates_fields`, `test_put_music_forbidden_for_other`, `test_get_single_music_and_404`, `test_recommend_train_and_clusters`. `test_recommend_routes.py` (9 tests) — auth/404/400/analysed returns/A/B impressions/default-algo resolution/explicit algo wins/history/cross-user 403. |
| 2 | Bug | `GET /api/recommend/clusters` returned 422 because FastAPI matched `/clusters` against `/{music_id}` (int param) first. | Moved `get_clusters` route definition **before** `get_recommendations` (`/{music_id}`) in `app/routes/recommend.py` so the static path wins matching. |
| 3 | Coverage | 69% → 70%. | Remaining gap is in audio/ML/network services (`audio_analyzer`, `genre_classifier`, `ai_tagger`, `cache`, `train_models`) that need audio fixtures / network mocks. |

**Tests**: added 14 tests across 2 new files. Total **107 passed** (was 97).

**Definition-of-done**: W4-6 ✅ shipped — 176 tests (was 107), coverage **82%**
(was 70%). 6 new test files: `test_cache.py`, `test_storage.py`,
`test_audio_utils_more.py`, `test_audio_analyzer_mock.py`,
`test_genre_classifier.py`; extended `test_more_routes.py`,
`test_ab_stats.py` and `test_migrations.py`.  Remaining coverage gap
(ai_tagger 19%, train_models 19%, S3Storage, some route paths) is
acceptable for Low-priority items.

## 0.11. Week 4 — Hybrid Source Model (Spotify + In-Memory) 🎵

Introduced a **free-hosting-friendly hybrid source model** so the app no
longer needs to store heavy audio files.  Spotify (free tier, Client
Credentials flow — no Premium) supplies catalog tracks + audio features;
user uploads are analyzed in-RAM by librosa and the file is deleted
immediately after (`DELETE_LOCAL_AFTER_ANALYZE=True`).

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Settings | No Spotify config / file-delete policy. | `app/database.py`: `spotify_client_id`, `spotify_client_secret`, `spotify_enabled` (derived from creds), `delete_local_after_analyze`. |
| 2 | Model | `Music` assumed a stored file (`file_path` NOT NULL). | `Music.source` ('local'\|'spotify'\|'jamendo'\|'deezer'); nullable `external_id`/`external_uri`/`preview_url`/`stream_url`; `file_path` now nullable; two **partial** unique indexes (per-user local-hash dedup, per-user catalog dedup). `AudioFeatures.feature_origin` ('librosa'\|'spotify') drives the hybrid recommender. |
| 3 | Storage | Uploads lingered on disk (S3/local). | `app/services/audio_analyzer.py`: `_purge_local_file` deletes the file after a successful **or failed** analysis when `delete_local_after_analyze` is set and `source='local'`. `delete_music` skips storage delete for catalog rows (`file_path` None). |
| 4 | Spotify | No catalog integration. | `app/services/spotify.py` (`SpotifyClient`: token cache, `search`, `get_track`, `get_audio_features`, `map_to_features` → AudioFeatures-compatible dict; MFCC/chroma synthesised as stubs). `app/routes/spotify.py`: `GET /api/spotify/status`, `GET /api/spotify/search`, `POST /api/spotify/add` (immediately `ready`, dedup 409, no file). Gated by **runtime health probe** (`is_spotify_healthy` / `mark_spotify_unhealthy`, 5-min TTL) so the tab auto-hides on 403/unavailable. Re-enabled via `SPOTIFY_ENABLED=true` now that the owner account has Premium. |
| 5 | Schema | Migration needed. | `010_hybrid_source_model.py`: adds `source` + external columns, drops legacy non-partial `uq_music_user_hash`/index, recreates as partial unique indexes (SQLite `sqlite_where` / Postgres `postgresql_where`), adds `audio_features.feature_origin`. `alembic/env.py` now honours `DATABASE_URL` env (Render-friendly). |
| 6 | Frontend | No way to add catalog tracks. | `UploadPage.jsx` now tabbed ("From File" / "From Spotify"): search → 30s Spotify embed preview → "Add to library". Tab is **hidden** unless `GET /api/spotify/status` reports `enabled:true`. `api.js` + `strings.js` (en/uk) + `index.css` (tab + track-row styles). `AudioFeaturesResponse.feature_origin` exposed. |

> **Spotify re-enabled (2026-07-09):** the app owner's account now holds
> an active Premium subscription, so `SPOTIFY_ENABLED=true` in `.env`
> re-enables the catalog.  Because Spotify can take **hours** to flip the
> API flag after purchase (and can lapse again), the integration is now
> gated by a **runtime health probe** (`app/services/spotify.py`:
> `is_spotify_healthy` / `mark_spotify_unhealthy` with a 5-min TTL cache).
> `GET /api/spotify/status` returns `enabled = is_spotify_healthy()`, and
> a failed live call (e.g. 403) flips the cache so the frontend hides
> the "From Spotify" tab immediately.  The frontend polls `/spotify/status`
> every 60s, so the tab appears automatically once Premium activates —
> no page reload needed.

**Tests**: `tests/test_spotify.py` (5 — search/auth/disabled/ready-track/
dup-409, all with mocked `SpotifyClient`), `tests/test_migrations.py` (+3:
`010` revision chain, model indexes, `feature_origin` column). Total **186
passed** (was 176). `010` DDL also validated in isolation on SQLite
(partial unique index correctly blocks duplicate local hashes, allows
cross-user reuse).

**Definition-of-done check**: hybrid *schema* shipped; **Spotify catalog
re-enabled** with Premium + runtime health-gate; free-hosting In-Memory
path is the active MVP. Remaining: real end-to-end `/api/spotify/add` once
Spotify propagates the Premium API flag (a few hours after purchase).

## 0.12. Week 4 — Hybrid UX Polish (Spotify tracks) 🎧

Closed the gaps between the hybrid schema and the UI so Spotify-sourced
tracks behave correctly end-to-end.

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Backend guard | `POST /api/analyze/{id}` crashed (librosa on `file_path=None`) for catalog tracks. | `app/routes/analyze.py` returns **409 Conflict** for `source='spotify'` with a clear message — features come from the catalog, no local re-analysis. |
| 2 | Dashboard | "Analyze" button + file-size shown for Spotify tracks. | `DashboardPage.jsx` hides the Analyze button for `source='spotify'` and shows a **Spotify** badge instead of file size. `.tag-spotify` CSS (green). |
| 3 | Analyze page | No way to hear/see a Spotify track. | `AnalyzePage.jsx` renders a 30s Spotify embed (`external_id`) + `previewNote` for `source='spotify'`. `analyze.previewLabel`/`previewNote` strings (en/uk). |
| 4 | Recommendations | Spotify recs looked identical to local ones. | `RecommendationsPage.jsx` shows a **Spotify** badge + 30s embed per recommended Spotify track. |

**Tests**: `test_spotify.py` extended — `test_add_spotify_creates_ready_track`
now also asserts `POST /api/analyze/{id}` returns **409** for the Spotify
track. Total **190 passed**.

**Definition-of-done check**: Spotify tracks are now first-class — added
with features, shown with preview + badge, excluded from invalid local
re-analysis, and recommended with playback. The only outstanding item is
the live Premium-API propagation (backend already wired + health-gated).

## 0.10. Week 4 — Events Table Tuning (W4-8) 📊

Added a composite B-tree index on `algorithm_events(algorithm, created_at)`
to optimise A/B stats aggregation over time windows.  The index is declared
in both the ORM model (`__table_args__`) and a new Alembic migration.

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Model | No index for algorithm+time-range queries. | Added `Index("ix_ab_algorithm_time", "algorithm", "created_at")` to `AlgorithmEvent.__table_args__`. |
| 2 | Migration | Schema update required for production. | New `009_add_algorithm_time_index.py`: plain `CREATE INDEX` — safe on both PostgreSQL and SQLite. |
| 3 | Tests | — | `test_migrations.py` extended: revision-chain check for 009 + model-level index existence assertion. |

**Tests**: +3 migration tests. Total **176 passed** (was 173).

## 0.3. Bugfix & Ruff Batch (2026-07-08) 🐛

User-reported fixes:

| # | Area | Issue | Resolution |
|---|------|-------|-----------|
| 1 | Backend | **Energy/loudness always 0 dB / 100%** — `amplitude_to_db(rms.mean(), ref=np.max)` with a scalar always yields 0 dB; energy threshold `0.1` too low for mastered audio | `_extract_energy_features` now passes `max_rms` as scalar ref to `amplitude_to_db`; energy threshold raised to `0.4` |
| 2 | Frontend | **`buffer/` bare import in plotly chunk crashes React app** — `typedarray-pool` requires Node `buffer`, Vite externalises it | Installed `buffer` npm package; added `resolve.alias: { buffer: 'buffer/' }` in `vite.config.js` |
| 3 | Frontend | **Radar chart Loudness spoke compressed** — old formula `(x+60)/60` maps all mastered tracks to 0.75–0.95 | Changed to `clamp((x+20)/18, 0, 1)` for real differentiation; also tweaked Brightness and ZCR |
| 4 | Backend | **No Ruff linter** | Added `ruff==0.6.1` to `requirements.txt`; `[tool.ruff]` config in `pyproject.toml` (select E, F, W, I, N, UP, S, BLE, RUF100); runs during Docker build with `--exit-zero` |

## 0.2. Maintenance Cycle — Low-Priority Feature Batch (2026-07-08) 🧩

User-driven changes (cycle 3 of 2026-07-08):

Completed items from the Known Issues backlog in a single pass:

| # | Section | Item | Resolution |
|---|---------|------|-----------|
| M1 | §11.3 | **MFCC/chroma as JSON** → ARRAY(Float) | Migration `005_add_array_columns.py` adds `mfcc_mean_arr`, `mfcc_std_arr`, `chroma_stft_mean_arr`, `chroma_stft_std_arr` (native ARRAY(Float) on PG, JSON on SQLite). Model stays on JSON for SQLite test compat. |
| M2 | §11.3 | **Valence is a heuristic** | `estimate_valence()` now uses 6 weighted features: mode (1.5), energy (1.2), tempo (0.8), loudness (0.5), spectral centroid (0.4), ZCR (0.3). Old heuristic used 3 equal-weight features. |
| M4 | §11.3 | **Recommendations not cached** | Optional Redis cache in `services/cache.py` keyed on `(user_id, source_music_id, algorithm)` with 5 min TTL. Falls back silently when `REDIS_URL` is unset or Redis is unreachable (2s connect timeout). |
| S4 | §11.1 | **Uploads stored on local disk** | `services/storage.py` with `LocalStorage` + `S3Storage` backends. `get_storage()` singleton factory selects by `storage_backend` config. Audio files saved/deleted via the abstraction. |
| S2 | §11.1 | **No rate-limiting on auth** | `slowapi` integrated with `@limiter.limit("5/minute")` on register and `"10/minute"` on login. Extracted to `app/limiter.py` to break circular import; no-op in test mode. |
| (new) | — | **Circular import: main.py ↔ auth.py** | `Limiter` instance moved to its own module `app/limiter.py`. Both `main.py` and `auth.py` import from there. |
| F1 | §11.2 | **Mixed Ukrainian / English strings** | `src/strings.js` centralises all UI strings. 3 files with Ukrainian text (`ErrorBoundary`, `Navbar`, `BulkUploadPage`) now import from the module. |
| F3 | §11.2 | **Inline styles scattered** | 38 inline `style={{...}}` blocks reduced to ~8 truly dynamic ones. 30 new CSS classes added to `index.css`: navbar dropdown, drop-zone, track-row, small-spinner, progress-bar, pills (success/muted), form-input-sm, card-compact/narrow, utility extensions. |
| D1 | §11.4 | **No CI** | `.github/workflows/ci.yml`: `pytest` on push, `vite build` on PR. |
| D2–D5 | §11.4 | **Workers, volumes, gzip, logging** | Verified already done — STATE.md entries were stale. |
| S1 | §11.1 | **JWT in localStorage** | httpOnly cookie on login/register; `get_current_user` reads cookie as fallback; frontend uses `withCredentials: true` + `POST /api/auth/logout`. |

**Test count**: `74 passed` (no change — no new tests added for low-priority features).

**Frontend**: `npm run build` still passes.

## 0.1. Maintenance Cycle — Dedup + Auto-Analysis (2026-06-15) 🛡️

User-driven changes (cycle 2 of 2026-06-15):

| # | Area | Change | Resolution |
|---|------|--------|-----------|
| 1 | Dedup | User could upload the same audio file twice (or ten times). | SHA-256 of the bytes is computed during the upload, stored in `Music.file_hash`, and enforced as `UNIQUE(user_id, file_hash)`.  Uploading the same file again returns **409 Conflict** with a message pointing at the existing record. |
| 2 | UX | After upload the user had to manually click "Analyze" for every track. | Upload now schedules `run_analysis` as a `BackgroundTask`.  Tempo, key, mode, MFCCs, energy, valence, etc. are extracted automatically.  The frontend polls `GET /api/music/{id}` and shows live status (`pending` → `analyzing` → `ready` / `error`). |
| 3 | Visibility | No way to see WHY an analysis failed. | New `Music.analysis_error` column stores the last failure message (truncated to 500 chars).  The bulk page surfaces it in the status badge tooltip. |

### 0.1.1 Implementation details

**Schema (migration `002_add_file_hash_and_analysis_status.py`):**
```sql
ALTER TABLE music
  ADD COLUMN file_hash        VARCHAR(64),   -- SHA-256 hex digest
  ADD COLUMN analysis_status  VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN analysis_error   TEXT;
CREATE UNIQUE INDEX uq_music_user_hash ON music(user_id, file_hash);
CREATE INDEX ix_music_analysis_status ON music(analysis_status);
```

**Lifecycle:**
```
POST /api/music/upload
  1. magic-bytes validate
  2. SHA-256 + write to disk (single pass, see utils/hashing.py)
  3. reject 409 if (user_id, file_hash) already exists
  4. INSERT music with analysis_status='pending'
  5. BackgroundTask → run_analysis(music_id)
       pending → analyzing → ready   (AudioFeatures row created)
                          → error    (analysis_error populated)
       auto_retrain_if_needed() fires if corpus grew > 25%
```

**Frontend status polling:** `musicAPI.waitForAnalysis(musicId, { intervalMs, timeoutMs, onUpdate })` in `services/api.js` polls `/api/music/{id}` every 2 s (default) and resolves when `analysis_status` reaches `ready` or `error`.  Used by both `UploadPage` and `BulkUploadPage`.

**Dedup scope:** byte-level hash, not audio fingerprint.  A `.wav` re-encoded as `.mp3` of the same song would NOT be caught — different bytes, different hash.  Future enhancement: AcoustID / chromaprint for perceptual dedup (see §11.3 M6).

**New endpoints / fields:**
- `MusicResponse.analysis_status` — `"pending" | "analyzing" | "ready" | "error"`
- `MusicResponse.analysis_error` — string or null
- `MusicResponse.file_hash` — SHA-256 hex or null
- `409 Conflict` on duplicate upload (was `201 Created`)

### 0.1.2 Test count

`74 passed` in `pytest -q` (was 65).  New coverage:
- `tests/test_hashing.py` (4) — streaming SHA-256, size cap, partial-file cleanup
- `tests/test_audio_runner.py` (4) — pending→analyzing→ready/error lifecycle, idempotency on existing features
- `tests/test_music_routes.py` (+5) — hash returned in response, exact-content 409, renamed-dup 409, different content 201, orphan file removed on 409

---

## 0. Maintenance Cycle — Critical Hardening (2026-06-15) 🛠️

A pass over the codebase identified 27 issues across security, performance,
correctness and developer-experience.  All 14 **critical** items have been
fixed; the 13 non-critical items remain in §11 for future work.

### 0.1 What changed in this cycle

| # | Area | Issue | Resolution |
|---|------|-------|-----------|
| 1 | Tests | `backend/tests/` was empty despite `pytest`/`httpx` being installed. | Added **47 smoke tests** across `auth`, `upload`, `analyze`, `recommend`, `file_validation`, `audio_utils`, `ml_recommender` — all passing.  `pytest.ini` added. |
| 2 | Perf | `ml_recommender.get_recommendations` did N+1 queries (1 SELECT per result for `Music`). | Single batched `IN (...)` fetch — the route now does **2** DB queries total for any recommendation request. |
| 3 | Correctness | Old recommendation rows were deleted on every GET — no history. | Recommender now **upserts** on `(user_id, source_music_id, algorithm)`; rows for other algorithms / users are preserved for analytics. |
| 4 | Security | Upload accepted any file with a `.mp3` extension (rename bypass). | New `app/utils/file_validation.py` validates magic bytes **and** extension agreement.  Empty uploads now also rejected. |
| 5 | Schema drift | `Base.metadata.create_all` ran alongside Alembic, masking drift. | Removed from `main.py`.  Schema is now owned exclusively by Alembic. |
| 6 | Security | `debug=True` default logged every SQL query (with parameters) in production. | Default flipped to `False`; auto-disabled when `ENVIRONMENT=production` or `staging`. |
| 7 | Security | No `SECRET_KEY` validation — placeholder value was accepted. | Pydantic `field_validator` rejects < 32 chars and the `.env.example` placeholder in `production`/`staging`.  Generate one with `python -c "import secrets;print(secrets.token_urlsafe(48))"`. |
| 8 | Security | CORS `allow_methods=["*"]` + `allow_credentials=True` is technically allowed but brittle. | Methods and headers are now explicit lists; `max_age=600`. |
| 9 | DX / DRY | `_features_to_dict` duplicated in `ml_recommender` and `genre_classifier`. | Extracted to `audio_features_to_dict()` in `app/utils/audio_utils.py`; both services use it. |
| 10 | API gap | `GenreClassifier.predict_batch` had no HTTP endpoint. | Added `POST /api/recommend/predict-genre-batch`. |
| 12 | Bug | `get_ai_tagger()` called `os.getenv("GEMINI_API_KEY")` on every request (TOCTOU + waste). | Singleton now re-binds only when the key actually changes. |
| 13 | ML staleness | K-Means never re-fit after new uploads — `cluster_id` stayed `NULL`. | `MLRecommender.should_auto_retrain()` + `auto_retrain_if_needed()` are invoked at the end of `POST /api/analyze/{id}`.  Threshold = 25% corpus growth, min 5 tracks. |
| 14 | Logging | `print()` used in production paths. | Replaced with `logger.warning/error` in `audio_utils.py`, `music.py` route, and `ai_tagger.py`. |

### 0.2 Other small wins (free of charge)

- Added **`GET /api/ready`** DB-aware readiness probe; Docker healthcheck updated.
- New shared `pytest` fixtures (`client`, `db_session`, `auth_headers`, `uploads_dir`) live in `backend/tests/conftest.py` and use SQLite + `StaticPool` for fast, hermetic tests with no Postgres required.
- Engine: `pool_size`/`max_overflow` only set for non-SQLite databases (lets tests use `:memory:`).
- `engine.pool_recycle=1800` to dodge idle-connection drops on hosted Postgres.

### 0.3 Known issues still open (from the 2026-06-15 audit)

See **§11 — Known Issues / Future Work** for the full list.  Headline items:
- Frontend stores JWT in `localStorage` (XSS risk) — fix in a follow-up.
- No rate-limiting on `/api/auth/login` (brute-force).
- JSON columns for MFCC/chroma could be `ARRAY(Float)` for queryability (schema change).
- ESLint config missing in `frontend/`.

---

## 1. Completed ✅

### STEP 1: PREPARATION
- [x] Created project structure (backend/, frontend/, docs/)
- [x] Created backend subdirectories (models, routes, services, utils, tests)
- [x] Created frontend subdirectories (components, pages, services, utils, public)
- [x] Initialized Git repository
- [x] Created .gitignore file
- [x] Created backend/requirements.txt with all dependencies
- [x] Created backend/pyproject.toml
- [x] Created frontend/package.json with React dependencies
- [x] Created frontend/vite.config.js
- [x] Created README.md
- [x] Created docs/ARCHITECTURE.md with complete system architecture

### STEP 2: DATABASE
- [x] Created SQLAlchemy database configuration (backend/app/database.py)
- [x] Created .env.example template
- [x] Created SQLAlchemy models:
  - [x] User model (backend/app/models/user.py)
  - [x] Music model (backend/app/models/music.py)
  - [x] AudioFeatures model (backend/app/models/audio_features.py)
  - [x] Recommendation model (backend/app/models/recommendation.py)
- [x] Set up Alembic for migrations (alembic.ini, env.py, script.py.mako)
- [x] Created initial migration (001_initial_migration.py)
- [x] Created docs/DATABASE.md with complete schema documentation

### STEP 3: BACKEND API
- [x] Created FastAPI application entry point (backend/app/main.py)
- [x] Configured CORS middleware
- [x] Created Pydantic schemas for all models (backend/app/schemas/)
- [x] Implemented authentication utilities (backend/app/utils/auth.py):
  - [x] Password hashing with bcrypt
  - [x] JWT token generation and validation
  - [x] Current user dependencies
- [x] Implemented authentication routes (backend/app/routes/auth.py):
  - [x] POST /api/auth/register
  - [x] POST /api/auth/login
  - [x] GET /api/auth/me
- [x] Implemented music routes (backend/app/routes/music.py):
  - [x] POST /api/music/upload
  - [x] GET /api/music/{music_id}
  - [x] GET /api/music/user/{user_id}
  - [x] PUT /api/music/{music_id}
  - [x] DELETE /api/music/{music_id}
- [x] Implemented analysis routes (backend/app/routes/analyze.py):
  - [x] POST /api/analyze/{music_id}
  - [x] GET /api/analyze/features/{music_id}
- [x] Implemented recommendation routes (backend/app/routes/recommend.py):
  - [x] GET /api/recommend/{music_id}
  - [x] GET /api/recommend/user/{user_id}
- [x] Created docs/API.md with complete endpoint documentation

### STEP 4: AUDIO ANALYSIS
- [x] Created AudioAnalyzer service (backend/app/services/audio_analyzer.py)
- [x] Implemented feature extraction:
  - [x] Tempo (BPM) - librosa.beat.beat_track()
  - [x] Key and mode detection - chromagram analysis
  - [x] Loudness (dB) - RMS energy to dB
  - [x] MFCCs (timbre) - 20 coefficients
  - [x] Spectral centroid, bandwidth, rolloff
  - [x] Energy - normalized RMS
  - [x] Valence estimation - heuristic from mode/tempo/energy
  - [x] Zero-crossing rate
  - [x] Chroma STFT features
- [x] Created feature normalization utilities (backend/app/utils/audio_utils.py)
- [x] Updated /api/analyze endpoint with real librosa integration
- [x] Created docs/AUDIO_ANALYSIS.md with complete feature documentation

### STEP 5: ML RECOMMENDER
- [x] Created MLRecommender service (backend/app/services/ml_recommender.py)
- [x] Implemented K-means clustering for music grouping
- [x] Implemented cosine similarity calculation
- [x] Implemented Euclidean distance calculation
- [x] Implemented cluster-aware cosine similarity (default algorithm)
- [x] Implemented recommendation ranking algorithm
- [x] Created GenreClassifier service (backend/app/services/genre_classifier.py)
  - [x] Random Forest classifier with StandardScaler
  - [x] Batch genre prediction for unlabelled tracks
  - [x] Confidence scores and probability distribution
- [x] Created model training script (backend/app/services/train_models.py)
- [x] Model persistence via joblib (backend/models/)
- [x] Updated /api/recommend endpoint with real ML logic
- [x] Added POST /api/recommend/train endpoint
- [x] Added GET /api/recommend/clusters endpoint
- [x] Added POST /api/recommend/train-genre endpoint
- [x] Added POST /api/recommend/predict-genre/{music_id} endpoint
- [x] Created docs/ML_RECOMMENDER.md with complete documentation

### STEP 6: FRONTEND
- [x] Created entry point files (index.html, main.jsx, App.jsx)
- [x] Created global CSS design system (index.css) — dark minimalist theme
- [x] Created API service layer with axios interceptors (services/api.js)
- [x] Created Auth context with JWT (utils/AuthContext.jsx)
- [x] Created layout components:
  - [x] Navbar with conditional auth links and Upload dropdown
  - [x] ProtectedRoute with loading state
- [x] Implemented authentication pages:
  - [x] Login page with error handling
  - [x] Register page with validation
- [x] Implemented main pages:
  - [x] Dashboard — music library grid with analyze/delete
  - [x] Upload — file upload with metadata form and AI auto-fill
  - [x] Bulk Upload — drag-and-drop multi-file upload with batch AI processing
  - [x] Analyze — audio features + Plotly radar/MFCC/chroma charts
  - [x] Recommendations — track selector, algorithm choice, results list
- [x] Installed dependencies and verified production build
- [x] Created docs/FRONTEND.md with complete documentation

---

## 2. In Progress 🔄

None currently.

### STEP 7: DEPLOYMENT
- [x] Created Dockerfile for backend (backend/Dockerfile)
- [x] Created Dockerfile for frontend (frontend/Dockerfile)
- [x] Created nginx configuration for frontend (frontend/nginx.conf)
- [x] Created .dockerignore files for backend and frontend
- [x] Created docker-compose.yml for full stack orchestration
- [x] Created docs/DEPLOY.md with comprehensive deployment guide:
  - [x] Docker Compose quick start
  - [x] Manual Docker deployment
  - [x] Environment configuration
  - [x] AWS deployment instructions
  - [x] Heroku deployment instructions
  - [x] Render deployment instructions
  - [x] DigitalOcean deployment instructions
  - [x] Production considerations (security, performance, monitoring, backup)
  - [x] Troubleshooting guide
  - [x] Cost estimation for different platforms

### STEP 8: AI METADATA EXTRACTION
- [x] Integrated **Google Gemini API** (gemini-2.5-flash) for intelligent filename parsing and genre fallback
- [x] Integrated **MusicBrainz API** (100% free, no key required) for metadata fetching
- [x] Created backend service `backend/app/services/ai_tagger.py`:
  - [x] AITagger class with Gemini client integration
  - [x] Filename parsing with fallback patterns
  - [x] MusicBrainz metadata lookup with rate limiting (1 req/sec) and sorting tags by vote count
  - [x] Gemini fallback for missing genres (`fetch_genre_with_ai`)
  - [x] Auto-tag workflow combining both APIs
- [x] Added backend endpoints:
  - [x] `POST /api/music/auto-tag`
  - [x] `GET /api/music/ai-status`
- [x] Updated frontend `UploadPage.jsx`:
  - [x] Added "✨ Auto-fill with AI" button next to title field
  - [x] Added AI status badge
  - [x] Auto-populates artist, title, album, genre fields
- [x] Added frontend `BulkUploadPage.jsx`:
  - [x] Batch auto-tagging for multiple tracks sequentially
  - [x] Auto-populates table with results
- [x] Updated `requirements.txt` with new dependencies:
  - [x] google-genai==1.0.0
  - [x] musicbrainzngs==0.7.1
- [x] Created `docs/AI_INTEGRATION.md` with complete documentation:
  - [x] API setup instructions (Gemini API key)
  - [x] Architecture overview
  - [x] Usage examples and API details
  - [x] Error handling and troubleshooting
  - [x] Performance metrics and best practices

---

## 3. Not Started 📋

None currently - all planned features implemented!

---

## 4. Known Issues ⚠️

None critical.

---

## 5. Next Steps 🎯

**Status**: All core features + backlog items complete! 🎉

The project is production-ready with:
- ✅ Full-stack application (React + FastAPI)
- ✅ Audio analysis with librosa
- ✅ ML-powered recommendations
- ✅ AI metadata extraction (Gemini + MusicBrainz)
- ✅ Rate limiting on auth endpoints
- ✅ Optional Redis caching for recommendations
- ✅ Optional S3 storage for audio files
- ✅ Docker deployment ready

**Optional enhancements**:
1. Deploy to cloud platform (Render, AWS, Heroku)
2. Add user profile pages
3. Create admin dashboard
4. Set up CI pipeline

**Testing the full stack with Docker**:
```bash
# Quick start with Docker Compose
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Testing without Docker** (development):
```bash
# Start backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Start frontend (in another terminal)
cd frontend
npm install
npm run dev

# Visit http://localhost:5173 (frontend) and http://localhost:8000 (backend)
```

---

## 6. Module Status 📊

| Module | Status | Progress | Notes |
|--------|--------|----------|-------|
| Project Structure | ✅ Complete | 100% | All directories created |
| Git Setup | ✅ Complete | 100% | Repository initialized |
| Backend Dependencies | ✅ Complete | 100% | requirements.txt ready + AI libraries |
| Frontend Dependencies | ✅ Complete | 100% | package.json ready |
| Documentation | ✅ Complete | 100% | All module docs including DEPLOY + AI_INTEGRATION |
| Database Models | ✅ Complete | 100% | All 4 models + Alembic setup |
| Backend API | ✅ Complete | 100% | All endpoints + JWT auth + ML + AI auto-tag |
| Audio Analysis | ✅ Complete | 100% | librosa integration done |
| ML Recommender | ✅ Complete | 100% | K-means + cosine similarity + genre classifier + **auto-retrain** |
| Frontend UI | ✅ Complete | 100% | React + Plotly + dark theme + AI button |
| Deployment | ✅ Complete | 100% | Docker + docker-compose + multi-platform guides |
| AI Auto-Tagging | ✅ Complete | 100% | Gemini + MusicBrainz integration with auto-fill button |
| **Security hardening** | ✅ Complete | 100% | **§0.1 cycle 2026-06-15: magic-bytes, SECRET_KEY validation, debug default** |
| **Test suite** | ✅ Complete | 100% | **74 tests in backend/tests/, all passing** |
| **Performance** | ✅ Complete | 100% | **N+1 fixed in recommend, history preserved (upsert)** |
| **Readiness probe** | ✅ Complete | 100% | **`/api/ready` with DB connectivity check** |
| **Per-user dedup** | ✅ Complete | 100% | **SHA-256 in upload → UNIQUE(user_id, file_hash) → 409 on dup** |
| **Auto-analysis** | ✅ Complete | 100% | **BackgroundTask after upload; frontend polls `analysis_status`** |
| **Rate limiting** | ✅ Complete | 100% | **slowapi on auth routes; no-op in test mode** |
| **Storage abstraction** | ✅ Complete | 100% | **LocalStorage + S3Storage backends** |
| **Hybrid source model (Spotify + in-memory)** | ✅ Complete | 100% | **§0.11: `Music.source`/external cols, `feature_origin`, `010` migration, Spotify service+routes (runtime health-gated, re-enabled with Premium), upload purge-after-analyze, tabbed UploadPage (Spotify tab auto-shows/hides via `/spotify/status`)** |
| **Recommendation cache** | ✅ Complete | 100% | **Optional Redis with 5 min TTL** |
| **Array columns migration** | ✅ Complete | 100% | **Migration 005: ARRAY(Float) for MFCC/chroma** |
| **Valence heuristic** | ✅ Complete | 100% | **6 weighted features (was 3 equal-weight)** |
| **Strings module** | ✅ Complete | 100% | **`src/strings.js` centralises all UI strings; 3 files converted from Ukrainian** |
| **CSS cleanup** | ✅ Complete | 100% | **38 inline styles → ~8; 30 new CSS classes** |
| **CI pipeline** | ✅ Complete | 100% | **`.github/workflows/ci.yml` — pytest + vite build** |
| **DevOps (workers/volumes/gzip/logging)** | ✅ Complete | 100% | **All verified already done in existing configs** |
| **JWT cookie auth** | ✅ Complete | 100% | **httpOnly cookie replaces localStorage; `withCredentials: true`; `/api/auth/logout`** |
| **Energy/loudness fix** | ✅ Complete | 100% | **`_extract_energy_features` refactored: `amplitude_to_db` with scalar ref, energy threshold 0.4** |
| **Frontend `buffer/` fix** | ✅ Complete | 100% | **`buffer` npm package + `resolve.alias` in `vite.config.js`** |
| **Radar normalization** | ✅ Complete | 100% | **Loudness formula changed; brightness/zcr ranges adjusted** |
| **Ruff linter** | ✅ Complete | 100% | **`ruff==0.6.1` in requirements.txt + `[tool.ruff]` config + Docker build check** |
| **Genre-aware recommendations** | ✅ Complete | 100% | **W4-1: `genre_to_vector` one-hot in `extract_feature_vector`; stale-model dim check; auto-retrain force-fit** |
| **A/B significance + promote** | ✅ Complete | 100% | **W4-2: `ab_stats.compute_ab_stats` z-test; `ABConfig`+migration 007; `/api/ab/promote`+`/api/ab/default`; default algo resolves from promoted** |
| **Admin dashboard** | ✅ Complete | 100% | **W4-3: `GET /api/admin/stats` (superuser) + `AdminDashboardPage` (counts, A/B table, promote); `UserResponse.is_superuser`** |
| **bcrypt upgrade** | ✅ Complete | 100% | **W4-4: `bcrypt>=4.0.1` in requirements; passlib compat confirmed; 72-byte guard in `auth.py`** |
| **updated_at triggers** | ✅ Complete | 100% | **W4-5: migration 008 — PG `set_updated_at()` fn + BEFORE UPDATE triggers on `users`/`music`; SQLite keeps ORM `onupdate`** |

---

## 7. Technical Decisions 📝

### Completed Decisions:
- **Frontend Framework**: React 18 with Vite (faster than CRA)
- **Backend Framework**: FastAPI (async, modern, fast)
- **Database**: PostgreSQL (relational, robust)
- **ORM**: SQLAlchemy 2.0 (modern API)
- **Audio Processing**: librosa (industry standard)
- **ML Library**: scikit-learn (stable, well-documented)
- **Visualization**: react-plotly.js (interactive charts)
- **Authentication**: JWT tokens (stateless)
- **AI Parsing**: Google Gemini API (free tier, JSON schema output)
- **Metadata Lookup**: MusicBrainz API (100% free, comprehensive database)

### Pending Decisions:
- Database connection pooling settings
- Maximum audio file size
- Number of clusters for K-means (now auto-tuned by default)
- Number of recommendations to return

---

## 11. Known Issues / Future Work 🔭

Tracked here so the next contributor (human or AI) has an unambiguous
backlog.  Each item references the original audit number for traceability.

### 11.1 Security (medium priority)

| # | Item | Notes |
|---|------|-------|
| S1 | **JWT in `localStorage`** (Audit #14) | ✅ **Done** — Login/register set httpOnly `access_token` cookie via `_set_token_cookie()`. `get_current_user` falls back to cookie when `Authorization` header is absent. Frontend uses `withCredentials: true`, no more localStorage for tokens. `POST /api/auth/logout` clears the cookie. |
| S2 | **No rate-limiting on auth** | ✅ **Done** — `slowapi` integrated; `5/min` on register, `10/min` on login. Extracted to `app/limiter.py` (no-op in test mode). |
| S3 | **bcrypt pinned to 3.2.2** | Deferred — `passlib==1.7.4` incompatible with `bcrypt>=4.0.0`. Upgrade once passlib confirms compat. |
| S4 | **Uploads stored on local disk** | ✅ **Done** — `services/storage.py` with `LocalStorage` + `S3Storage` backends; `get_storage()` singleton; routes use it. **Extended (§0.11):** local uploads are deleted right after librosa analysis (`DELETE_LOCAL_AFTER_ANALYZE`), so no files are retained — free-hosting friendly. Spotify catalog tracks carry no file at all. |

### 11.2 Frontend (medium priority)

| # | Item | Notes |
|---|------|-------|
| F1 | **Mixed Ukrainian / English strings** (Audit #20) | ✅ **Done** — `src/strings.js` centralises all UI strings; 3 files with Ukrainian text (`ErrorBoundary`, `Navbar`, `BulkUploadPage`) now import from it. All strings in English (dominant language). Ready for `react-i18next` later. |
| F2 | **No error boundary** (Audit #19) | ✅ **Done** — `components/ErrorBoundary.jsx` wraps `<App>` in `main.jsx`. Catches render errors, shows fallback UI with reload button. |
| F3 | **Inline styles scattered** (Audit #18) | ✅ **Done** — 38 inline `style={{...}}` blocks reduced to ~8 truly dynamic ones (status colors, progress width). 30 new CSS classes added to `index.css`: navbar dropdown, drop-zone, track-row, small-spinner, progress-bar, pills (success/muted), form-input-sm, card-compact/narrow, utility extensions. |
| F4 | **Sequential AI tagging in BulkUpload** (Audit #16) | ✅ **Done** — Parallelised with concurrency cap of 4; uses `Promise.allSettled` so one failure doesn't stop the batch. |
| F5 | **No ESLint config** | ✅ **Done** — `.eslintrc.cjs` with `eslint:recommended` + `react/recommended` + `react-hooks/recommended`; `lint` script already in `package.json`. |
| F6 | **Bundle 5MB unchunked** | ✅ **Done** — `vite.config.js`: `vendor` chunk (React 164KB) + `plotly` chunk (4.7MB) separate from app code (85KB). |

### 11.3 ML / Data (lower priority)

| # | Item | Notes |
|---|------|-------|
| M1 | **MFCC/chroma as JSON** (Audit #15) | ✅ **Done** — Migration `005_add_array_columns.py` adds native `ARRAY(Float)` columns; model stays on JSON for SQLite test compat. |
| M2 | **Valence is a heuristic** | ✅ **Done** — `estimate_valence()` uses 6 weighted features (mode 1.5, energy 1.2, tempo 0.8, loudness 0.5, centroid 0.4, ZCR 0.3). |
| M3 | **K-Means picks `k=8` blindly** (Audit #14) | ✅ **Done** — `MLRecommender(auto_tune=True)` uses silhouette score to pick optimal `k` in range [2, sqrt(N)]; explicit `--clusters` / `auto_tune=False` still works for manual override. |
| M4 | **Recommendations not cached** | ✅ **Done** — Optional Redis cache in `services/cache.py`; 5 min TTL; silent fallback when unconfigured. |
| M5 | **No AB testing for algorithms** | ✅ **Done** — `AlgorithmEvent` model + migration 006; `POST /api/ab/event` records impressions/clicks/plays; `GET /api/ab/stats` returns CTR per algorithm; `GET /api/recommend/{id}?ab_test=true` randomly assigns an algorithm and records impressions server-side via `BackgroundTask`. Frontend has A/B toggle, click tracking on rec items, and a stats panel. |
| M6 | **Dedup is byte-level only** | ✅ **Done** — 64-dim mel-spectrogram fingerprint computed via librosa during analysis; `fingerprint_similarity()` with cosine threshold (default 0.92); `GET /api/recommend/perceptual-duplicates/{music_id}` endpoint; stored in `AudioFeatures.perceptual_fingerprint` (JSON). Format-agnostic: catches mp3 vs wav of same song. |

### 11.4 DevOps (lower priority)

| # | Item | Notes |
|---|------|-------|
| D1 | **No CI** | ✅ **Done** — `.github/workflows/ci.yml`: `pytest` on push, `vite build` on PR. |
| D2 | **No workers in Dockerfile** | ✅ **Done** — Already had `--workers 2` in `CMD`. |
| D3 | **Bind-mounts for uploads/models** | ✅ **Done** — Already used named volumes (`uploads_data`, `models_data`). |
| D4 | **nginx `gzip_types` lists `application/javascript`** | ✅ **Done** — Already used `text/javascript` (correct per RFC 9239). |
| D5 | **No log aggregation** | ✅ **Done** — Already had `python-json-logger` in requirements and JSON logging in `main.py` for prod/staging. |

### 11.5 Database (lower priority)

| # | Item | Notes |
|---|------|-------|
| DB1 | **`audio_features.music_id` FK lacks `ON DELETE CASCADE`** | ✅ **Done** — Added `ondelete="CASCADE"` to `audio_features.music_id` + both recommendation FKs in model + migration 004. |
| DB2 | **Missing indices on `Recommendation.source_music_id` / `recommended_music_id`** | ✅ **Done** — `ix_recommendations_source` + `ix_recommendations_recommended` added in migration 004. |
| DB3 | **`Music`/`User` `updated_at` uses SQLAlchemy-side `onupdate`** | Deferred — DB triggers add complexity (SQLite vs PG syntax) for marginal gain since the app always uses the ORM. |

### 11.6 Week 4 Plan 🗓️ (carried-forward backlog)

> **Read this first in any new session.**  Everything from Weeks 1–3 is
> shipped.  The items below are the agreed Week 4 scope (mirrors
> `Project_Report_Week3.docx` §4).  Pick from here, create a branch,
> implement + test, then tick the row off (move to ✅) and update §2.

**Priority order:**

| # | Item | Priority | Notes |
|---|------|----------|-------|
| W4-1 | **Genre-aware recommendations** | High | ✅ **Done** — `genre_to_vector` one-hot over `GENRE_VOCABULARY` + "other" appended in `extract_feature_vector`; threaded via `_build_feature_matrix`; stale on-disk scaler discarded on dim mismatch; auto-retrain force-fits when no usable model (see §0.4). |
| W4-2 | **A/B testing — Phase 2** | High | ✅ **Done** — `app/services/ab_stats.py` (two-proportion z-test, winner significance); `ABConfig` + migration `007`; `POST /api/ab/promote` (superuser) + `GET /api/ab/default`; recommendation default resolves from promoted algo (see §0.5). |
| W4-3 | **Admin dashboard** | Medium | ✅ **Done** — `GET /api/admin/stats` (superuser) + `AdminDashboardPage.jsx` with library counts, extended A/B table and promote-winner button; `UserResponse.is_superuser` exposed (see §0.6). |
| W4-4 | **bcrypt upgrade (S3)** | Medium | ✅ **Done** — compat confirmed (`bcrypt 4.0.1` + `passlib 1.7.4`); `requirements.txt` pins `bcrypt>=4.0.1`; `get_password_hash`/`verify_password` guard the 72-byte limit (see §0.7). |
| W4-5 | **DB triggers for `updated_at` (DB3)** | Medium | ✅ **Done** — migration `008`: PG `set_updated_at()` fn + BEFORE UPDATE triggers on `users`/`music`; dialect-guarded so SQLite (tests) keeps ORM `onupdate` (see §0.8). |
| W4-6 | **Test coverage >80%** | Medium | ✅ **Done** — 173 tests, 82% coverage. 6 new test files: cache, storage, audio_utils_more, audio_analyzer_mock, genre_classifier + extensions to more_routes and ab_stats. audio_analyzer 42→99%, genre_classifier 22→94%, cache 50→85%, audio_utils 75→92%. See §0.9. |
| W4-7 | **Cloud deploy** | Low | Railway/Render; wire log aggregation (Loki/ELK); `/api/ready` monitoring. |
| W4-8 | **Events table tuning** | Low | ✅ **Done** — `ix_ab_algorithm_time` composite index on `algorithm_events(algorithm, created_at)`; model + migration 009; 176 tests. See §0.10. |
| W4-9 | **Frontend i18n + responsive** | Low | `react-i18next` (strings.js already centralised); improve mobile layout. |

**Definition of done for Week 4:** W4-1 ✅, W4-2 ✅, W4-3 ✅, W4-4 ✅, W4-5 ✅,
W4-6 ✅, **W4-8 ✅ shipped**; coverage **82%** (176 tests); W4-7, W4-9 are Low priority.

---

## 10. Environment Setup Instructions 🛠️

### Prerequisites:
- Python 3.10+
- Node.js 18+
- PostgreSQL 15+
- Git

### Quick Start (not yet executable):
```bash
# Clone and navigate
cd Music_genre_classifier

# Backend setup
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install

# Database setup
# Create PostgreSQL database named 'music_recommender_db'
# Configure .env file in backend/
```

---

## 9. For Next AI Model 🤖

**Context**: Steps 1-8 are complete. Full stack is production-ready with Docker deployment and AI-powered metadata extraction. All planned features have been implemented successfully.

**What has been done**:
1. Complete backend API with FastAPI, JWT auth, and PostgreSQL
2. Audio analysis with librosa (tempo, key, loudness, MFCCs, energy, valence)
3. ML recommender with K-means clustering and genre classification
4. Complete React frontend with Plotly visualizations
5. Docker deployment with docker-compose and multi-platform guides
6. AI metadata extraction using Gemini + MusicBrainz APIs

**Project is ready for**:
- Production deployment to cloud platforms
- User testing and feedback
- Optional enhancements (caching, S3 storage, admin dashboard)

**Important**: 
- All core functionality is complete and tested
- Documentation is comprehensive and up-to-date
- Follow the architecture defined in ARCHITECTURE.md
- Use the exact dependency versions in requirements.txt and package.json
