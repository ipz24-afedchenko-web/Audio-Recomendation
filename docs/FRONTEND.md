# Frontend Documentation

## Overview

The frontend is a **React 18** single-page application built with **Vite**, featuring a minimalist dark-themed UI. It communicates with the FastAPI backend via REST API using **axios** with JWT authentication.

---

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| Vite 5 | Build tool & dev server |
| React Router v6 | Client-side routing |
| Axios | HTTP client with interceptors |
| react-plotly.js | Audio feature visualizations |
| Inter (Google Fonts) | Typography |

---

## Project Structure

```
frontend/
├── index.html              ← HTML entry point
├── package.json             ← Dependencies & scripts
├── nginx.conf               ← Nginx config (proxy /api/ → backend:8000)
├── vite.config.js           ← Vite config (proxy to backend in dev)
└── src/
    ├── main.jsx             ← React entry point
    ├── App.jsx              ← Root component with routing
    ├── index.css            ← Global styles (design system)
    ├── components/
    │   ├── Navbar.jsx       ← Navigation bar with Upload dropdown
    │   └── ProtectedRoute.jsx ← Auth route guard
    ├── pages/
    │   ├── LoginPage.jsx        ← Login form
    │   ├── RegisterPage.jsx     ← Registration form
    │   ├── DashboardPage.jsx    ← Music library grid
    │   ├── UploadPage.jsx       ← Single file upload with AI auto-fill
    │   ├── BulkUploadPage.jsx   ← Multi-file upload with batch AI auto-fill
    │   ├── AnalyzePage.jsx      ← Audio analysis + charts
    │   └── RecommendationsPage.jsx ← ML recommendations
    ├── services/
    │   └── api.js           ← Axios API service
    └── utils/
        └── AuthContext.jsx  ← Auth state management
```

---

## Pages & Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | LoginPage | Public — username/password form |
| `/register` | RegisterPage | Public — registration |
| `/` | DashboardPage | Protected — music library grid |
| `/upload` | UploadPage | Protected — single file upload |
| `/bulk-upload` | BulkUploadPage | Protected — multi-file upload |
| `/analyze/:musicId` | AnalyzePage | Protected — audio analysis |
| `/recommendations` | RecommendationsPage | Protected — ML recommendations |

---

## Pages

### Login (`/login`)
- Username/password form
- JWT token stored in localStorage
- Auto-redirect to Dashboard on success

### Register (`/register`)
- Username, email, password form
- Auto-login after registration
- Client-side validation (min 8 chars)

### Dashboard (`/`)
- Grid view of user's uploaded tracks
- Track metadata: title, artist, album, duration, genre
- **Analyze** button → triggers analysis + navigates to results
- **Delete** button with confirmation dialog
- Empty state with upload prompt

### Upload (`/upload`)
- Single file input for MP3/WAV/FLAC/OGG
- Auto-fills title from filename on file selection
- **"✨ Auto-fill with AI"** button — calls `/api/music/auto-tag`
- AI status badge (`✦ AI ready` / `AI not configured`) in the title label
- Button disabled if AI service not configured
- Optional: artist, album, genre fields
- Redirects to Dashboard after upload

### Bulk Upload (`/bulk-upload`) ← **NEW**
- **Drag & drop zone** — accepts multiple files simultaneously
- **File picker** (multiple) — click zone to open dialog
- **File list** — table with inline-editable fields (title, artist, album, genre)
- **Status badges** per track: Очікує / AI обробка / Готовий / Завантажую / ✓ Завантажено / ✗ Помилка
- **"✨ AI автозаповнення всіх"** — runs auto-tag on all tracks sequentially
- **Per-row "✨" button** — tag individual track
- **"⬆ Завантажити всі"** — parallel upload (3 concurrent chunks)
- **Progress bar** — visual feedback during bulk operations
- **Deduplication** — same filename cannot be added twice
- Toolbar: clear uploaded tracks, clear all

### Analyze (`/analyze/:musicId`)
- **6 metric cards**: Tempo, Key, Duration, Loudness, Energy, Valence
- **Radar chart**: Audio profile (Energy, Valence, Tempo, Loudness, Brightness, ZCR)
- **MFCC bar chart**: 20 timbre coefficients
- **Chromagram**: 12 pitch class distribution
- "Get Recommendations" button

### Recommendations (`/recommendations`)
- Track selector dropdown
- Algorithm choice (Cosine / Euclidean / Cluster-Aware)
- Limit slider (1-50)
- **Train Model** button for K-Means
- Results list with similarity scores

---

## Navbar

The navbar includes an **Upload dropdown** (hover to open):
- 🎵 **Один трек** → `/upload`
- 📂 **Масове завантаження** → `/bulk-upload`

Dropdown is implemented with React state (`useState`) and CSS `position: absolute` with a `fadeIn` animation.

---

## Design System

### Theme
- **Dark mode** with deep navy backgrounds (`#0a0a0f`, `#12121a`)
- **Accent color**: Purple (`#6c5ce7`)
- **Font**: Inter (300–700 weights)
- **Border radius**: 6px–14px
- **Animations**: 150ms–250ms ease transitions + `@keyframes fadeIn`

### CSS Architecture
All styles in a single `index.css` file using CSS custom properties:
- `--bg-*` — Background colors
- `--text-*` — Text colors
- `--accent` — Brand color
- `--space-*` — Spacing scale
- `--radius-*` — Border radius scale

### Components
- `.card` — Container with border and hover effect
- `.btn` — Button with variants (`primary`, `secondary`, `danger`, `sm`)
- `.form-input` — Input fields with focus ring
- `.alert` — Error/success/info messages (`.alert-error`, `.alert-success`, `.alert-info`)
- `.tag` — Genre labels and badges
- `.spinner` — Loading animation

---

## API Integration

### Service Layer (`services/api.js`)

```javascript
// Automatic JWT injection
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-redirect on 401
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
  }
  return Promise.reject(error);
});
```

### Available API Modules

| Module | Methods |
|--------|---------|
| `authAPI` | `register(data)`, `login(data)`, `getMe()` |
| `musicAPI` | `upload(fd)`, `getById(id)`, `getUserMusic()`, `update(id,data)`, `delete(id)`, `autoTag(fd)`, `aiStatus()` |
| `analyzeAPI` | `analyze(id)`, `getFeatures(id)` |
| `recommendAPI` | `get(id,params)`, `getUserHistory(id)`, `train()`, `getClusters()`, `trainGenre()`, `predictGenre(id)` |

**`musicAPI.aiStatus()`** — calls `GET /api/music/ai-status`, returns `{ available: bool, message: string }`.
Used by both UploadPage and BulkUploadPage to show AI status badge.

---

## Authentication Flow

```
Register/Login → Backend returns JWT → Stored in localStorage
                                      → AuthContext fetches /auth/me
                                      → User state set globally
                                      → ProtectedRoute checks auth
                                      → 401 → auto logout + redirect
```

---

## Development

### Start Dev Server
```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000` with API proxy to `http://localhost:8000`.

### Build for Production
```bash
npm run build
```

Output in `frontend/dist/`.

---

## Nginx Configuration (Production)

`frontend/nginx.conf` handles:
- Serving React SPA (with `try_files $uri /index.html` for client-side routing)
- Proxying `/api/` requests to `backend:8000`
- 50MB upload limit (`client_max_body_size 50M`)
- Extended timeouts for ML tasks (`proxy_read_timeout 300s`)
- CORS headers on preflight (`OPTIONS`) requests

---

## Responsive Design

- **Desktop**: Full grid layout, sidebar navigation
- **Tablet**: Reduced grid columns
- **Mobile**: Single column, hidden username in navbar

Breakpoint: `768px`

---

**Last Updated**: 2026-06-12
