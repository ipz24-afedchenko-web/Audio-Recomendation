# Project Core Rules: Audio-Based Music Recommender

> **This file is the contract between AI models and the human maintainer.**
> Read it BEFORE touching the codebase.  Anything not covered here is fair
> game, but if you change a convention, update this file in the same PR.

---

## 1. Tech Stack (immutable unless a new ADR is added)

- **Backend:** Python 3.10+, FastAPI, SQLAlchemy 2.0, PostgreSQL (prod) /
  SQLite (tests), Pydantic v2, librosa, scikit-learn, joblib.
- **Frontend:** React 18 with Vite, **JavaScript only** (no TypeScript),
  Axios, react-plotly.js / plotly.js.
- **AI integrations:** Google Gemini (via `google-genai`), MusicBrainz
  (via `musicbrainzngs`).
- **Communication:** Frontend hits FastAPI at `http://localhost:8000` in
  dev, through nginx in prod (same origin: `http://localhost`).

---

## 2. Coding Standards

### 2.1 Backend (FastAPI)

1. Follow the standard layout:
   `routes/` (HTTP), `services/` (business logic), `models/` (ORM),
   `schemas/` (Pydantic), `utils/` (pure helpers).  **Do not** add a
   `models.py` / `audio_analysis.py` / `ml_recommender.py` at the
   package root — they live in their respective subpackages.
2. Use Pydantic v2 (`from pydantic import BaseModel, field_validator`).
   The project is on pydantic 2.9+.
3. **CORS is enabled** for `http://localhost`, `http://localhost:3000`,
   `http://localhost:5173`.  If you need another origin, add it to
   `app/main.py` and document it here.
4. All `POST` routes that accept file uploads MUST validate with
   `app.utils.file_validation.validate_audio_file` — never trust
   extensions or Content-Type headers alone.  Uploads are also
   deduplicated by SHA-256 content hash — see §4.
5. **No `print()`** in production code paths.  Use `logger = logging.getLogger(__name__)`
   and `logger.info/warning/error`.
6. **No `Base.metadata.create_all`** at runtime.  The schema is owned by
   Alembic.  Adding a new model = writing a new migration under
   `backend/alembic/versions/`.
7. **DB session** is injected via `Depends(get_db)`; do not import
   `SessionLocal` directly inside route handlers.
8. **Authorization**: any endpoint that touches a `Music` row MUST check
   `music.user_id == current_user.id` (or `current_user.is_superuser`).
   Use the helper in `app.utils.auth.get_current_active_user`.

### 2.2 Frontend (React / JavaScript)

1. **No TypeScript.**  Files end in `.jsx` or `.js`.  Type stubs may
   live in `*.d.ts` only if strictly necessary.
2. **Axios** for all HTTP.  The base URL is `/api` (proxied by Vite
   in dev and by nginx in prod).  JWT is sent as an httpOnly cookie
   (`access_token`).  Axios uses `withCredentials: true` (set in
   `services/api.js`).  No localStorage for tokens.
3. **Component modularity**: keep UI components dumb.  Audio-analysis
   logic lives in services; data fetching via the `*API` modules.
4. **Hooks**: `useState` for local state, `useEffect` for side effects,
   `useContext` only for cross-cutting concerns (auth, theme).
5. **Plotly**: data MUST be in the standard `[{ type, x, y, ... }]`
   shape before being passed to `<Plot>`.  Do not mutate the data
   object after rendering.
6. **No raw `localStorage` access** outside `AuthContext.jsx` /
   `services/api.js`.  Centralise the storage keys.
7. **`buffer` polyfill**: `vite.config.js` has `resolve.alias: { buffer: 'buffer/' }`
   for plotly.js CJS compat.  No other Node.js polyfills are used.

### 2.3 Shared

- All audio-feature → vector conversion goes through
  `app.utils.audio_utils.extract_feature_vector` and
  `audio_features_to_dict`.  **Do not** write local copies.
- Logging format: `%(asctime)s [%(levelname)s] %(name)s: %(message)s`.
  Add the format explicitly when introducing a new entry point
  (`logging.basicConfig(...)`).
- Energy/loudness: `AudioAnalyzer._extract_energy_features` computes
  `loudness` via `librosa.amplitude_to_db(mean_rms, ref=max_rms)`
  (not `ref=np.max` — that's a scalar identity bug).  Energy is
  normalized as `mean_rms / 0.4`, clamped to `[0, 1]`.

---

## 3. Configuration & Secrets

- `backend/.env` is **never** committed (see `.gitignore` line 39).
  The template lives in `backend/.env.example`.
- **`SECRET_KEY`** must be at least 32 chars.  Use
  `python -c "import secrets;print(secrets.token_urlsafe(48))"`.
  The placeholder from `.env.example` is rejected when
  `ENVIRONMENT=production` or `staging`.
- **`GEMINI_API_KEY`** is required only for the AI-tagger endpoints.
  Without it, `ai_tagger` raises and `/api/music/auto-tag` returns 503.
- **`DEBUG=True`** is auto-disabled in `production` / `staging`; do not
  rely on SQL echo being on.
- **`bcrypt` pinned to `==3.2.2`** in `requirements.txt` because
  `passlib==1.7.4` is incompatible with `bcrypt>=4.0.0` (password length
  check added in bcrypt 4.x).  To upgrade: confirm passlib compat first.

---

## 4. ML & Recommendations

- The recommender persists models in `backend/models/` via joblib.
  Three artefacts: `kmeans_model.joblib`, `scaler_model.joblib`,
  `genre_classifier.joblib`, `genre_label_encoder.joblib`,
  `genre_scaler.joblib`.
- `MLRecommender.auto_retrain_if_needed` is the single entry point
  for re-fitting K-Means.  It is called from the `analyze` route after
  each successful analysis.  Manual retraining is still possible via
  `POST /api/recommend/train`.
- History semantics for `Recommendation`: rows are upserted on the
  `(user_id, source_music_id, algorithm)` triple.  Other triples are
  preserved.

## 4.1 Uploads, dedup & auto-analysis

- **Dedup.** `POST /api/music/upload` computes a SHA-256 of the audio
  bytes WHILE writing them to disk (`app/utils/hashing.py`).  The hash
  is stored in `Music.file_hash` and enforced as
  `UNIQUE(user_id, file_hash)`.  A duplicate upload returns
  **409 Conflict** with a message pointing at the existing record.  The
  duplicate file is removed from `UPLOAD_DIR` in the same request.
- **Auto-analysis.** Immediately after a successful INSERT, the route
  schedules `services.audio_analyzer.run_analysis(music_id)` as a
  FastAPI `BackgroundTask`.  It owns its own DB session, never blocks
  the HTTP response, and updates `Music.analysis_status`:
  `pending → analyzing → ready` (or `error` with `analysis_error`
  populated).  Manual retries use the same code path via
  `POST /api/analyze/{music_id}`.
- **Polling.** The frontend uses `musicAPI.waitForAnalysis(musicId)`
  in `services/api.js` to poll until the status is terminal.  The
  default 2 s interval / 90 s timeout is tuned for a 5 MB clip on a
  laptop; tune in `frontend/src/services/api.js` if your hardware
  needs more.
- **Idempotency.** `run_analysis` is safe to call twice: if
  `AudioFeatures` already exist for the track, the runner is a no-op.

---

## 5. Testing

- `cd backend && pytest` — runs **74 tests** in ~10 s.
- Tests use **SQLite in-memory** via `StaticPool`; no Postgres or
  Docker required.
- The shared `client` fixture already overrides the `get_db`
  dependency, so test code can just call `client.post(...)`.
- The autouse `_redirect_production_session_local` fixture rebinds
  `app.database.SessionLocal` (and the audio runner's, and the train
  script's) to the test sessionmaker — so the BackgroundTask runner
  sees the same schema as the rest of the suite.  When you add a
  service that uses its own `SessionLocal`, add it to that fixture too.
- New tests should live under `backend/tests/test_<module>.py` and
  follow the naming `test_<thing>_<expected>`.

Run before every commit:
```bash
cd backend && pytest -q          # all 74 must pass
cd backend && ruff check app/    # lint check
cd frontend && npm run build     # vite production build
```

---

## 6. Project Structure & Documentation

- Always refer to `docs/` for architecture details.
- Maintain `STATE.md` after any significant change (Backend or Frontend).
  The "Module Status" table at the end of STATE.md is the source of
  truth for what is shipped.
- Before implementing new features, check if the logic belongs in
  `audio_utils` / `services/audio_analyzer` (raw analysis) or
  `services/ml_recommender` (recommendation).
- Out-of-scope improvements go in `STATE.md` §11 (Known Issues /
  Future Work) with an audit number for traceability.

---

## 7. AI Interaction

- For audio processing, prioritise `librosa`; the only custom DSP we
  have is in `services/audio_analyzer.py`.
- When updating the API, ensure the frontend component that consumes
  it is updated accordingly if the data structure changes.
- This project is designed for **multi-model continuity**: any new
  model that reads AGENTS.md, STATE.md and the docs/ folder should
  be able to pick up where the previous one left off.

---

## 8. Handoff Checklist (for the next AI)

If you are picking up this codebase, do this in order:

1. Read `README.md` (purpose + quick-start).
2. Read `STATE.md` end-to-end — pay special attention to **§0
   Maintenance Cycle** and **§11 Known Issues / Future Work**.
3. Skim `docs/ARCHITECTURE.md` and `docs/API.md`.
4. Run `cd backend && pytest -q` (74 must pass), `cd backend && ruff check app/`,
   and `cd frontend && npm run build` to confirm the baseline is green.
5. Pick an item from STATE.md §11; create a branch; implement + test;
   update STATE.md (move from §11 into §0 if it's a new maintenance
   cycle, or tick it off in §11 otherwise).
6. Open a PR referencing the audit number (e.g. "Fixes S1 from §11.1").

Welcome aboard. 🎵
